/**
 * PredictiveService - thin API client wrapper around the backend predictive endpoints.
 *
 * All scoring and ML logic lives exclusively in backend/src/services/PredictiveService.ts
 * and is exposed via backend/src/routes/predictive.ts.
 */
import { OpenAPI } from '../api/core/OpenAPI';
import { request } from '../api/core/request';
import {
  PostAnalysisInput,
  ReachPrediction,
  MLModelMetrics,
} from '../types/predictive';

class PredictiveService {
  public async predictReach(input: PostAnalysisInput): Promise<ReachPrediction> {
    return request(OpenAPI, {
      method: 'POST',
      url: '/predictive/reach',
      body: {
        ...input,
        scheduledTime: input.scheduledTime?.toISOString(),
      },
    });
  }

  public async getModelMetrics(postId: string): Promise<{ metrics: MLModelMetrics }> {
    return request(OpenAPI, {
      method: 'GET',
      url: '/predictive/history/{postId}',
      path: { postId },
    });
  }

  public async batchPredict(inputs: PostAnalysisInput[]): Promise<ReachPrediction[]> {
    return Promise.all(inputs.map((input) => this.predictReach(input)));
  }
}

export const predictiveService = new PredictiveService();
