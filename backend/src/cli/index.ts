import { Command, InvalidArgumentError } from 'commander';
import { clearCache } from '../admin/cacheAdminService';
import { getDiscoveredQueueNames, retryFailedJobs } from '../admin/jobAdminService';
import { listMigrations, runMigrations } from '../admin/migrationService';
import { createLogger } from '../lib/logger';

const logger = createLogger('admin-cli');

const parsePositiveInteger = (value: string): number => {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new InvalidArgumentError(`Expected a positive integer but received "${value}".`);
  }

  return parsed;
};

const requireConfirmation = (shouldConfirm: boolean, message: string): void => {
  if (!shouldConfirm) {
    throw new Error(message);
  }
};

const program = new Command();

program
  .name('socialflow-admin')
  .description('Administrative CLI for backend maintenance tasks.')
  .showHelpAfterError()
  .hook('preAction', (_, command) => {
    logger.info('Starting admin command', {
      command: command.name(),
      args: command.args,
      options: command.opts(),
    });
  });

program
  .command('cache:clear')
  .description('Clear Redis-backed cache keys by pattern.')
  .option('--pattern <pattern>', 'Redis key pattern to remove', 'cache:*')
  .option('--all', 'Target every key in the current Redis database')
  .option('--batch-size <number>', 'Redis SCAN and UNLINK batch size', parsePositiveInteger, 250)
  .option('--dry-run', 'Preview affected keys without deleting them')
  .option('-y, --yes', 'Confirm destructive execution')
  .action(async (options) => {
    if (options.all && !options.dryRun) {
      requireConfirmation(options.yes, 'Refusing to clear every Redis key without --yes.');
    }

    const result = await clearCache(
      {
        pattern: options.all ? '*' : options.pattern,
        batchSize: options.batchSize,
        dryRun: options.dryRun,
      },
      logger,
    );

    logger.info('cache:clear finished', result);
  });

program
  .command('jobs:retry')
  .description('Retry failed BullMQ jobs for one or more queues.')
  .option('--queue <name>', 'BullMQ queue name to target')
  .option('--all', 'Target all discovered queue names')
  .option('--job-id <id>', 'Retry one specific failed job')
  .option(
    '--limit <number>',
    'Maximum number of failed jobs to retry per queue',
    parsePositiveInteger,
    50,
  )
  .option('--dry-run', 'Preview retry targets without retrying jobs')
  .option('-y, --yes', 'Confirm bulk retry execution')
  .action(async (options) => {
    if (!options.queue && !options.all) {
      throw new Error('Provide --queue <name> or --all to target failed jobs.');
    }

    if (options.jobId && !options.queue) {
      throw new Error('Retrying a single job requires --queue <name>.');
    }

    if (!options.dryRun && !options.jobId) {
      requireConfirmation(options.yes, 'Refusing bulk failed-job retries without --yes.');
    }

    const queueNames = options.all ? await getDiscoveredQueueNames() : [options.queue];

    if (queueNames.length === 0) {
      throw new Error(
        'No queue names were discovered. Set WORKER_MONITOR_QUEUES or run migrations:run first.',
      );
    }

    for (const queueName of queueNames) {
      const result = await retryFailedJobs(
        {
          queueName,
          limit: options.limit,
          dryRun: options.dryRun,
          jobId: options.jobId,
        },
        logger,
      );

      logger.info('jobs:retry finished for queue', result);
    }
  });

program
  .command('migrations:list')
  .description('List available migrations and whether they have been applied.')
  .action(async () => {
    const statuses = await listMigrations();
    logger.info('migrations:list finished', {
      migrations: statuses,
    });
  });

program
  .command('migrations:run')
  .description('Run pending admin migrations.')
  .option('--name <migrationName>', 'Run one specific migration by name')
  .option('--dry-run', 'Preview pending migrations without mutating Redis')
  .option('-y, --yes', 'Confirm migration execution')
  .action(async (options) => {
    if (!options.dryRun) {
      requireConfirmation(options.yes, 'Refusing to run migrations without --yes.');
    }

    const result = await runMigrations(
      {
        name: options.name,
        dryRun: options.dryRun,
      },
      logger,
    );

    logger.info('migrations:run finished', result);
  });

const main = async (): Promise<void> => {
  await program.parseAsync(process.argv);
};

void main().catch((error) => {
  logger.error('Admin CLI execution failed', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
