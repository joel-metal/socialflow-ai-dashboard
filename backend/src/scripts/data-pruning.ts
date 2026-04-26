import { runDataPruning } from '../retention/dataPruningService';
import { createLogger } from '../lib/logger';

const logger = createLogger('data-pruning');

const main = async (): Promise<void> => {
  const summary = await runDataPruning();
  logger.info('Completed', { summary });
};

void main().catch((error) => {
  logger.error('Failed', { error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
});
