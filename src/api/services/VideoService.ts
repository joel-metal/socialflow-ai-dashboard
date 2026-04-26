// Auto-generated from backend/openapi.yaml — do not edit manually.
import { OpenAPI } from '../core/OpenAPI';
import { request } from '../core/request';
import type { HealthStatus, VideoJob } from '../models';

export class VideoService {
  static uploadVideo(formData: FormData): Promise<{ message?: string; jobId?: string; status?: string }> {
    return request(OpenAPI, {
      method: 'POST',
      url: '/api/video/upload',
      body: formData,
      mediaType: 'multipart/form-data',
    });
  }

  static getVideoJob(jobId: string): Promise<VideoJob> {
    return request(OpenAPI, { method: 'GET', url: '/api/video/job/{jobId}', path: { jobId } });
  }

  static listVideoJobs(): Promise<{ jobs?: VideoJob[] }> {
    return request(OpenAPI, { method: 'GET', url: '/api/video/jobs' });
  }

  static cancelVideoJob(jobId: string): Promise<{ message?: string }> {
    return request(OpenAPI, { method: 'DELETE', url: '/api/video/job/{jobId}', path: { jobId } });
  }

  static getVideoQueueStatus(): Promise<Record<string, unknown>> {
    return request(OpenAPI, { method: 'GET', url: '/api/video/queue/status' });
  }

  static getVideoHealth(): Promise<HealthStatus> {
    return request(OpenAPI, { method: 'GET', url: '/api/video/health' });
  }
}
