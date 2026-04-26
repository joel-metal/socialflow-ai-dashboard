import { videoService } from '../VideoService';
import { TranscodingOptions } from '../../types/video';

describe('VideoService', () => {
  describe('createTranscodingJob', () => {
    it('should create a job with default options', async () => {
      const mockInputPath = '/path/to/video.mp4';
      const jobId = await videoService.createTranscodingJob(mockInputPath);

      expect(jobId).toBeDefined();
      expect(typeof jobId).toBe('string');

      const job = videoService.getJob(jobId);
      expect(job).toBeDefined();
      expect(job?.inputPath).toBe(mockInputPath);
      expect(job?.status).toBe('pending');
      expect(job?.progress).toBe(0);
    });

    it('should create a job with custom options', async () => {
      const mockInputPath = '/path/to/video.mp4';
      const options: TranscodingOptions = {
        qualities: [{ name: '720p', width: 1280, height: 720, bitrate: '2500k' }],
        formats: [{ extension: 'mp4', codec: 'libx264', audioCodec: 'aac' }],
      };

      const jobId = await videoService.createTranscodingJob(mockInputPath, options);
      const job = videoService.getJob(jobId);

      expect(job?.qualities).toHaveLength(1);
      expect(job?.qualities[0].name).toBe('720p');
      expect(job?.formats).toHaveLength(1);
      expect(job?.formats[0].extension).toBe('mp4');
    });
  });

  describe('getJob', () => {
    it('should return undefined for non-existent job', () => {
      const job = videoService.getJob('non-existent-id');
      expect(job).toBeUndefined();
    });
  });

  describe('getAllJobs', () => {
    it('should return all jobs', async () => {
      const jobId1 = await videoService.createTranscodingJob('/path/to/video1.mp4');
      const jobId2 = await videoService.createTranscodingJob('/path/to/video2.mp4');

      const allJobs = videoService.getAllJobs();
      expect(allJobs.length).toBeGreaterThanOrEqual(2);

      const jobIds = allJobs.map((job) => job.id);
      expect(jobIds).toContain(jobId1);
      expect(jobIds).toContain(jobId2);
    });
  });

  describe('cancelJob', () => {
    it('should cancel an existing job', async () => {
      const jobId = await videoService.createTranscodingJob('/path/to/video.mp4');
      const cancelled = await videoService.cancelJob(jobId);

      expect(cancelled).toBe(true);
    });

    it('should return false for non-existent job', async () => {
      const cancelled = await videoService.cancelJob('non-existent-id');
      expect(cancelled).toBe(false);
    });
  });
});
