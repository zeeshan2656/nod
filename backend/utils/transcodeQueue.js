const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const cache = require('../config/cache');
const { transcodeToHLS } = require('./ffmpegHelper');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class TranscodeQueue {
  constructor(concurrency = 1) {
    this.queue = [];
    this.activeJobs = 0;
    this.concurrency = concurrency;
  }

  /**
   * Add a transcoding job to the background queue
   */
  addJob(job) {
    this.queue.push(job);
    console.log(`[Queue] Job added for ${job.type} ID ${job.id}. Queue length: ${this.queue.length}`);
    this.processNext();
  }

  /**
   * Process the next job in queue if concurrency allows
   */
  async processNext() {
    if (this.activeJobs >= this.concurrency || this.queue.length === 0) {
      return;
    }

    const job = this.queue.shift();
    this.activeJobs++;

    console.log(`[Queue] Starting transcoding job for ${job.type} ID ${job.id}.`);
    
    try {
      // 1. Run ultra-fast stream-copy or single-pass conversion
      await transcodeToHLS(job.inputPath, job.outputPath, job.height, !!job.isWebReady);

      // Find the associated upload_queue session for status update
      const [sessions] = await db.query(
        'SELECT upload_id, status FROM upload_queue WHERE video_id = ?',
        [job.id]
      );
      const session = sessions[0];

      if (session && session.status !== 'cancelled') {
        await db.query('UPDATE upload_queue SET status = "completed" WHERE upload_id = ?', [session.upload_id]);
      }

      // 2. Update Database Record
      const webPath = `/uploads/processed/videos/${job.id}/master.m3u8`;
      
      await db.query(
        `UPDATE videos SET file_path = ?, status = 'ready' WHERE id = ?`,
        [webPath, job.id]
      );

      console.log(`[Queue] Job succeeded for video ID ${job.id}. Transcoded HLS manifest: ${webPath}`);

      // 3. Clean up the temporary original file
      if (fs.existsSync(job.inputPath)) {
        fs.unlinkSync(job.inputPath);
        console.log(`[Queue] Cleared temp original file: ${job.inputPath}`);
      }

      // 4. Invalidate Cache so the new video displays instantly
      await cache.del('feed_videos_*');
      await cache.del(`video_${job.id}`);
      console.log('[Queue] Invalidated related video caches.');

    } catch (err) {
      console.error(`[Queue] Transcoding failed for video ID ${job.id}:`, err.message);
      
      // Update upload_queue to failed
      await db.query(
        'UPDATE upload_queue SET status = "failed" WHERE video_id = ?',
        [job.id]
      );

      await db.query(
        `UPDATE videos SET status = 'failed' WHERE id = ?`,
        [job.id]
      );

      // Cleanup on failure as well
      if (fs.existsSync(job.inputPath)) {
        try {
          fs.unlinkSync(job.inputPath);
        } catch (_) {}
      }
    } finally {
      this.activeJobs--;
      this.processNext();
    }
  }
}

// Export singleton instance with concurrency = 1 (optimal for average servers/PCs)
const transcodeQueue = new TranscodeQueue(1);
module.exports = transcodeQueue;
