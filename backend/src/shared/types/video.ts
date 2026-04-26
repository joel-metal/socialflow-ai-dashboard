export interface VideoQuality {
  name: string;
  width: number;
  height: number;
  bitrate: string;
}

export interface VideoFormat {
  extension: string;
  codec: string;
  audioCodec: string;
}

export interface TranscodingJob {
  id: string;
  inputPath: string;
  outputDir: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  qualities: VideoQuality[];
  formats: VideoFormat[];
  createdAt: Date;
  updatedAt: Date;
  error?: string;
  outputs?: TranscodedOutput[];
}

export interface TranscodedOutput {
  quality: string;
  format: string;
  path: string;
  size: number;
}

export interface TranscodingOptions {
  qualities?: VideoQuality[];
  formats?: VideoFormat[];
  outputDir?: string;
}
