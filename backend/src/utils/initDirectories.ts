import fs from 'fs/promises';
import path from 'path';
import { createLogger } from '../lib/logger';

const logger = createLogger('initDirectories');

/**
 * Initialize required directories for the application
 */
export async function initDirectories(): Promise<void> {
  const directories = [
    path.join(process.cwd(), 'uploads', 'videos'),
    path.join(process.cwd(), 'uploads', 'transcoded'),
    path.join(process.cwd(), 'uploads', 'tts'),
  ];

  for (const dir of directories) {
    try {
      await fs.mkdir(dir, { recursive: true });
      logger.info(`Directory ensured: ${dir}`);
    } catch (error) {
      logger.error(`Failed to create directory ${dir}`, { error });
    }
  }
}
