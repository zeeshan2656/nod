const db = require('./config/db');
const cache = require('./config/cache');
const { getVideoMetadata, extractFrameToBuffer } = require('./utils/ffmpegHelper');
const fs = require('fs');
const path = require('path');

const TEST_VIDEO_PATH = 'C:\\xampp\\htdocs\\freehublive\\freehublive\\test_valid.mp4';

async function runVerification() {
  console.log('--- STARTING PLATFORM VERIFICATION ---');

  // 1. Test Database
  try {
    const [rows] = await db.query('SELECT 1 + 1 AS result');
    console.log('✅ Database Connection Pool: SUCCESS. 1 + 1 =', rows[0].result);
  } catch (err) {
    console.error('❌ Database Connection Pool: FAILED.', err.message);
  }

  // 2. Test Cache
  try {
    await cache.set('test_verify_key', { status: 'cache_is_working' }, 10);
    const cached = await cache.get('test_verify_key');
    if (cached && cached.status === 'cache_is_working') {
      console.log('✅ Cache Service (Redis/Memory Fallback): SUCCESS. Retrieve matched.');
    } else {
      console.log('❌ Cache Service: FAILED. Retreived:', cached);
    }
  } catch (err) {
    console.error('❌ Cache Service: FAILED with error.', err.message);
  }

  // 3. Test FFmpeg & FFprobe
  if (fs.existsSync(TEST_VIDEO_PATH)) {
    console.log(`Found test video file at: ${TEST_VIDEO_PATH}`);
    
    // Test Metadata extraction
    try {
      const meta = await getVideoMetadata(TEST_VIDEO_PATH);
      console.log('✅ FFprobe Metadata Extraction: SUCCESS.');
      console.log('   - Duration:', meta.duration, 'seconds');
      console.log('   - Dimensions:', meta.width, 'x', meta.height);
      console.log('   - Aspect Ratio:', meta.aspect_ratio);
      console.log('   - File Size:', (meta.file_size / (1024 * 1024)).toFixed(2), 'MB');
      
      // Test Frame Extraction
      try {
        // Extract frame at 1.5 seconds
        const imgBuffer = await extractFrameToBuffer(TEST_VIDEO_PATH, 1.5);
        if (imgBuffer && imgBuffer.length > 0) {
          const outPath = path.join(__dirname, 'verify_thumbnail.jpg');
          fs.writeFileSync(outPath, imgBuffer);
          console.log(`✅ FFmpeg On-Demand Frame Extraction: SUCCESS. Saved test thumbnail (${(imgBuffer.length / 1024).toFixed(2)} KB) to: ${outPath}`);
        } else {
          console.log('❌ FFmpeg On-Demand Frame Extraction: FAILED. Buffer was empty.');
        }
      } catch (frameErr) {
        console.error('❌ FFmpeg On-Demand Frame Extraction: FAILED.', frameErr.message);
      }

    } catch (metaErr) {
      console.error('❌ FFprobe Metadata Extraction: FAILED.', metaErr.message);
    }
  } else {
    console.log(`⚠️ Test video file not found at: ${TEST_VIDEO_PATH}. Skipping FFmpeg verification.`);
  }

  console.log('--- VERIFICATION COMPLETED. EXITING. ---');
  process.exit(0);
}

runVerification();
