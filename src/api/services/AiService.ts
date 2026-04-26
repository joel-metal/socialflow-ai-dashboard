// Auto-generated from backend/openapi.yaml — do not edit manually.
import { OpenAPI } from '../core/OpenAPI';
import { request } from '../core/request';
import type { AnalyzeImageRequest } from '../models';

export class AiService {
  static analyzeImage(body: AnalyzeImageRequest): Promise<{ caption?: string }> {
    return request(OpenAPI, { method: 'POST', url: '/api/ai/analyze-image', body });
  }
}
