export type TTSProvider = 'elevenlabs' | 'google';
export type TTSJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface TTSVoice {
  id: string;
  name: string;
  language: string;
  gender?: 'male' | 'female' | 'neutral';
  provider: TTSProvider;
}

export interface TTSSegment {
  text: string;
  voiceId?: string;
  language?: string;
  /** Speed multiplier: 0.5–2.0, default 1.0 */
  speed?: number;
  /** Stability 0–1 (ElevenLabs only) */
  stability?: number;
  /** Similarity boost 0–1 (ElevenLabs only) */
  similarityBoost?: number;
}

export interface TTSJobRequest {
  /** Single text or multiple segments for multi-voice narration */
  segments: TTSSegment[];
  /** Preferred provider; falls back to the other if unavailable */
  provider?: TTSProvider;
  /** Output audio format */
  outputFormat?: 'mp3' | 'wav' | 'ogg';
  /** Optional video file to merge narration into */
  videoPath?: string;
  /** User ID for SSE progress events */
  userId?: string;
}

export interface TTSSegmentResult {
  index: number;
  audioPath: string;
  durationMs: number;
  text: string;
}

export interface TTSJob {
  id: string;
  status: TTSJobStatus;
  progress: number;
  request: TTSJobRequest;
  segments: TTSSegmentResult[];
  /** Final merged audio file */
  outputAudioPath?: string;
  /** Final video with merged narration */
  outputVideoPath?: string;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}
