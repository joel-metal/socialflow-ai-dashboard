import { VideoQuality, VideoFormat } from '../types/video';

export const videoConfig = {
  // Upload settings
  upload: {
    maxFileSize: 500 * 1024 * 1024, // 500MB
    allowedMimeTypes: [
      'video/mp4',
      'video/mpeg',
      'video/quicktime',
      'video/x-msvideo',
      'video/webm',
    ],
    uploadDir: 'uploads/videos',
    transcodedDir: 'uploads/transcoded',
  },

  // Queue settings
  queue: {
    maxConcurrent: 1, // Process one video at a time
    jobCleanupAge: 24 * 60 * 60 * 1000, // 24 hours
  },

  // Quality presets
  qualities: {
    '1080p': { name: '1080p', width: 1920, height: 1080, bitrate: '5000k' },
    '720p': { name: '720p', width: 1280, height: 720, bitrate: '2500k' },
    '480p': { name: '480p', width: 854, height: 480, bitrate: '1000k' },
    '360p': { name: '360p', width: 640, height: 360, bitrate: '500k' },
  } as Record<string, VideoQuality>,

  // Format presets
  formats: {
    mp4: { extension: 'mp4', codec: 'libx264', audioCodec: 'aac' },
    webm: { extension: 'webm', codec: 'libvpx-vp9', audioCodec: 'libopus' },
  } as Record<string, VideoFormat>,

  // FFmpeg settings
  ffmpeg: {
    audioChannels: 2,
    audioFrequency: 44100,
    audioBitrate: '128k',
  },
};
