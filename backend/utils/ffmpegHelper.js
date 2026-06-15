const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Resolve paths for ffmpeg and ffprobe from environment variables or fallback npm installer packages
let ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
let ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';

if (ffmpegPath === 'ffmpeg') {
  try {
    const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
    ffmpegPath = ffmpegInstaller.path;
  } catch (e) {
    // Fallback to global ffmpeg
  }
}

if (ffprobePath === 'ffprobe') {
  try {
    const ffprobeInstaller = require('@ffprobe-installer/ffprobe');
    ffprobePath = ffprobeInstaller.path;
  } catch (e) {
    // Fallback to global ffprobe
  }
}

// Ensure fallback or configured binaries have execution permissions on Unix/Linux systems
if (process.platform !== 'win32') {
  try {
    if (path.isAbsolute(ffmpegPath) && fs.existsSync(ffmpegPath)) {
      fs.chmodSync(ffmpegPath, 0o755);
      console.log(`[FFmpeg] Ensured executable permissions (0755) on: ${ffmpegPath}`);
    }
  } catch (err) {
    console.error(`[FFmpeg] Failed to set permissions on ${ffmpegPath}:`, err.message);
  }

  try {
    if (path.isAbsolute(ffprobePath) && fs.existsSync(ffprobePath)) {
      fs.chmodSync(ffprobePath, 0o755);
      console.log(`[FFprobe] Ensured executable permissions (0755) on: ${ffprobePath}`);
    }
  } catch (err) {
    console.error(`[FFprobe] Failed to set permissions on ${ffprobePath}:`, err.message);
  }
}

/**
 * Helper to calculate Greatest Common Divisor (for aspect ratio)
 */
function gcd(a, b) {
  return b ? gcd(b, a % b) : a;
}

/**
 * Gets video metadata using ffprobe
 * @param {string} filePath - Absolute path to video file
 * @returns {Promise<object>} - Resolves to duration, width, height, aspect_ratio, file_size
 */
function getVideoMetadata(filePath) {
  return new Promise((resolve, reject) => {
    // Escape path for Windows
    const cmd = `"${ffprobePath}" -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate -show_entries format=duration,size -of json "${filePath}"`;
    
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(`ffprobe failed: ${stderr || error.message}`));
      }
      
      try {
        const data = JSON.parse(stdout);
        const stream = data.streams && data.streams[0];
        const format = data.format;
        
        if (!stream) {
          return reject(new Error('No video stream found in the file.'));
        }

        const duration = parseFloat(format.duration || 0);
        const fileSize = parseInt(format.size || 0, 10);
        const width = parseInt(stream.width || 0, 10);
        const height = parseInt(stream.height || 0, 10);
        
        // Calculate aspect ratio
        let aspect_ratio = '16:9';
        if (width > 0 && height > 0) {
          const divisor = gcd(width, height);
          aspect_ratio = `${width / divisor}:${height / divisor}`;
        }

        resolve({
          duration,
          width,
          height,
          aspect_ratio,
          file_size: fileSize
        });
      } catch (err) {
        reject(new Error(`Failed to parse ffprobe metadata: ${err.message}`));
      }
    });
  });
}

/**
 * Extracts a frame at a specific timestamp and returns the buffer
 * @param {string} filePath - Absolute path to video file
 * @param {number} timestamp - Time in seconds to extract frame
 * @returns {Promise<Buffer>} - Resolves with image buffer
 */
function extractFrameToBuffer(filePath, timestamp) {
  return new Promise((resolve, reject) => {
    // Fast-seek input seek (-ss before -i) for ultra-fast frame extraction (under 100ms)
    const ffmpegProcess = spawn(ffmpegPath, [
      '-ss', timestamp.toFixed(3),
      '-i', filePath,
      '-threads', '2',
      '-vframes', '1',
      '-vf', 'scale=1280:-1',
      '-q:v', '2',
      '-f', 'image2',
      '-'
    ]);

    const chunks = [];
    const errChunks = [];

    ffmpegProcess.stdout.on('data', (chunk) => {
      chunks.push(chunk);
    });

    ffmpegProcess.stderr.on('data', (chunk) => {
      errChunks.push(chunk);
    });

    ffmpegProcess.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        const errMsg = Buffer.concat(errChunks).toString();
        reject(new Error(`ffmpeg frame extraction failed (exit code ${code}): ${errMsg}`));
      }
    });

    ffmpegProcess.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Helper to run a spawned process with promise interface
 */
function runProcess(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args);
    let stderr = '';
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Process ${cmd} exited with code ${code}. Error: ${stderr}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Transcodes a video file to adaptive HLS playlists (360p, 540p, 720p)
 * @param {string} inputPath - Original video filepath
 * @param {string} outputDir - Directory to store HLS output
 * @param {number} height - Height of source video
 * @returns {Promise<string>} - Resolves with master playlist content / filename
 */
async function transcodeToHLS(inputPath, outputDir, height) {
  // Ensure output directories exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const resolutions = [];
  
  // Choose resolutions to transcode based on original source height
  // Always include 360p as base quality
  resolutions.push({ name: '360p', height: 360, width: 640, bitrate: '800k', maxrate: '856k', bufsize: '1200k' });

  if (height >= 540) {
    resolutions.push({ name: '540p', height: 540, width: 960, bitrate: '1400k', maxrate: '1498k', bufsize: '2100k' });
  }
  
  if (height >= 720) {
    resolutions.push({ name: '720p', height: 720, width: 1280, bitrate: '2800k', maxrate: '2996k', bufsize: '4200k' });
  }

  // Sequentially transcode each profile to prevent CPU overload
  for (const profile of resolutions) {
    const profileDir = path.join(outputDir, profile.name);
    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
    }

    const playlistPath = path.join(profileDir, 'playlist.m3u8');
    const segmentPattern = path.join(profileDir, 'segment_%03d.ts');

    const args = [
      '-y',
      '-i', inputPath,
      '-threads', '2',
      '-vf', `scale=-2:${profile.height}`, // Scale, maintaining aspect ratio divisible by 2
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-preset', 'veryfast', // Fast transcoding
      '-b:v', profile.bitrate,
      '-maxrate', profile.maxrate,
      '-bufsize', profile.bufsize,
      '-g', '60', // Keyframe every 60 frames (2 seconds at 30fps)
      '-sc_threshold', '0',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ac', '2',
      '-f', 'hls',
      '-hls_time', '6', // 6-second segments
      '-hls_playlist_type', 'vod',
      '-hls_segment_filename', segmentPattern,
      playlistPath
    ];

    await runProcess(ffmpegPath, args);
  }

  // Create Master Playlist index
  let masterContent = '#EXTM3U\n#EXT-X-VERSION:3\n';
  
  for (const profile of resolutions) {
    let bandwidth = 800000;
    if (profile.name === '540p') bandwidth = 1400000;
    if (profile.name === '720p') bandwidth = 2800000;

    masterContent += `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${profile.width}x${profile.height}\n`;
    masterContent += `${profile.name}/playlist.m3u8\n`;
  }

  const masterPath = path.join(outputDir, 'master.m3u8');
  fs.writeFileSync(masterPath, masterContent);
  
  return masterPath;
}

module.exports = {
  getVideoMetadata,
  extractFrameToBuffer,
  transcodeToHLS,
  ffmpegPath,
  ffprobePath
};
