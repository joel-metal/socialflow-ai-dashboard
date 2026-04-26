import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

class VideoHealthService {
  /**
   * Check if FFmpeg is installed and accessible
   */
  public async checkFFmpeg(): Promise<{ available: boolean; version?: string; error?: string }> {
    try {
      const { stdout } = await execAsync('ffmpeg -version');
      const versionMatch = stdout.match(/ffmpeg version ([^\s]+)/);
      const version = versionMatch ? versionMatch[1] : 'unknown';

      return {
        available: true,
        version,
      };
    } catch (error) {
      return {
        available: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check if required codecs are available
   */
  public async checkCodecs(): Promise<{ codecs: Record<string, boolean> }> {
    const requiredCodecs = ['libx264', 'libvpx-vp9', 'aac', 'libopus'];
    const codecs: Record<string, boolean> = {};

    try {
      const { stdout } = await execAsync('ffmpeg -codecs');

      for (const codec of requiredCodecs) {
        codecs[codec] = stdout.includes(codec);
      }
    } catch (error) {
      // If ffmpeg -codecs fails, mark all as unavailable
      for (const codec of requiredCodecs) {
        codecs[codec] = false;
      }
    }

    return { codecs };
  }

  /**
   * Get comprehensive video service health status
   */
  public async getHealthStatus() {
    const [ffmpegStatus, codecStatus] = await Promise.all([this.checkFFmpeg(), this.checkCodecs()]);

    const isHealthy =
      ffmpegStatus.available && Object.values(codecStatus.codecs).every((available) => available);

    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      ffmpeg: ffmpegStatus,
      codecs: codecStatus.codecs,
      timestamp: new Date().toISOString(),
    };
  }
}

export const videoHealthService = new VideoHealthService();
