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
 * @returns {Promise<object>} - Resolves to duration, width, height, aspect_ratio, file_size, videoCodec, audioCodec, isWebReady
 */
function getVideoMetadata(filePath) {
  return new Promise((resolve, reject) => {
    // Escape path for Windows
    const cmd = `"${ffprobePath}" -v error -show_entries stream=codec_name,codec_type,width,height,r_frame_rate -show_entries format=duration,size,format_name -of json "${filePath}"`;
    
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(`ffprobe failed: ${stderr || error.message}`));
      }
      
      try {
        const data = JSON.parse(stdout);
        const streams = data.streams || [];
        const videoStream = streams.find(s => s.codec_type === 'video');
        const audioStream = streams.find(s => s.codec_type === 'audio');
        const format = data.format || {};
        
        if (!videoStream) {
          return reject(new Error('No video stream found in the file.'));
        }

        const duration = parseFloat(format.duration || 0);
        const fileSize = parseInt(format.size || 0, 10);
        const width = parseInt(videoStream.width || 0, 10);
        const height = parseInt(videoStream.height || 0, 10);
        const videoCodec = (videoStream.codec_name || '').toLowerCase();
        const audioCodec = (audioStream ? audioStream.codec_name : '').toLowerCase();
        
        // Calculate aspect ratio
        let aspect_ratio = '16:9';
        if (width > 0 && height > 0) {
          const divisor = gcd(width, height);
          aspect_ratio = `${width / divisor}:${height / divisor}`;
        }

        // Web-ready if H.264 video with AAC/MP3 or no audio
        const isWebReady = ['h264', 'avc1'].includes(videoCodec) && 
                           (!audioCodec || ['aac', 'mp3', 'opus'].includes(audioCodec));

        resolve({
          duration,
          width,
          height,
          aspect_ratio,
          file_size: fileSize,
          videoCodec,
          audioCodec,
          isWebReady
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
    let targetFile = filePath;
    const fileDir = path.dirname(filePath);

    // If target is master.m3u8, resolve to video.mp4 or playlist.m3u8 in same folder
    if (filePath.endsWith('master.m3u8')) {
      const mp4Candidate = path.join(fileDir, 'video.mp4');
      const playlistCandidate = path.join(fileDir, 'playlist.m3u8');
      if (fs.existsSync(mp4Candidate)) {
        targetFile = mp4Candidate;
      } else if (fs.existsSync(playlistCandidate)) {
        targetFile = playlistCandidate;
      }
    }

    // Fast-seek input seek (-ss before -i) for ultra-fast frame extraction (under 100ms)
    const ffmpegProcess = spawn(ffmpegPath, [
      '-ss', timestamp.toFixed(3),
      '-i', targetFile,
      '-threads', '2',
      '-vframes', '1',
      '-vf', 'scale=1280:-1',
      '-q:v', '2',
      '-f', 'image2',
      '-'
    ], {
      cwd: fileDir
    });

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
 * Fast-prepares a video for instant playback and HLS streaming
 * Eliminates redundant multi-pass re-encoding.
 * @param {string} inputPath - Original video filepath
 * @param {string} outputDir - Directory to store HLS output
 * @param {number} height - Height of source video
 * @param {boolean} isWebReady - True if video already has H264+AAC web codecs
 * @returns {Promise<string>} - Resolves with master playlist content / filename
 */
async function transcodeToHLS(inputPath, outputDir, height = 720, isWebReady = false) {
  // Ensure output directories exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const playlistPath = path.join(outputDir, 'playlist.m3u8');
  const segmentPattern = path.join(outputDir, 'segment_%03d.ts');
  const fastStartMp4 = path.join(outputDir, 'video.mp4');

  if (isWebReady) {
    // 1. Instant stream-copy faststart MP4 (0 re-encoding, takes ~0.2s)
    try {
      await runProcess(ffmpegPath, [
        '-y',
        '-i', inputPath,
        '-c', 'copy',
        '-movflags', '+faststart',
        fastStartMp4
      ]);
    } catch (_) {}

    // 2. Instant stream-copy HLS segmentation (cuts at keyframes, 0 CPU re-encoding overhead)
    await runProcess(ffmpegPath, [
      '-y',
      '-i', inputPath,
      '-c', 'copy',
      '-f', 'hls',
      '-hls_time', '4',
      '-hls_playlist_type', 'vod',
      '-hls_segment_filename', segmentPattern,
      playlistPath
    ]);
  } else {
    // Single-pass ultrafast transcode (replaces slow multi-pass loops)
    await runProcess(ffmpegPath, [
      '-y',
      '-i', inputPath,
      '-threads', '0',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ac', '2',
      '-f', 'hls',
      '-hls_time', '4',
      '-hls_playlist_type', 'vod',
      '-hls_segment_filename', segmentPattern,
      playlistPath
    ]);
  }

  // Create clean Master Playlist index
  const masterContent = 
`#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x${height || 720}
playlist.m3u8
`;

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
