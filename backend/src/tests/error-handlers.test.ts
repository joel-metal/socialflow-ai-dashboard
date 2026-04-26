/**
 * Error Handler Tests
 *
 * These tests verify that global error handlers work correctly.
 * Note: These tests should be run manually as they cause process exits.
 */

import { createLogger } from '../lib/logger';

const logger = createLogger('error-handler-test');

/**
 * Test 1: Uncaught Exception Handler
 *
 * This test triggers an uncaught exception to verify:
 * - Error is logged with full details
 * - Graceful shutdown is initiated
 * - Process exits with code 1
 *
 * To run: Uncomment the test and run the server
 */
export const testUncaughtException = () => {
  logger.info('Testing uncaught exception handler in 3 seconds...');

  setTimeout(() => {
    logger.info('Triggering uncaught exception now');
    throw new Error('TEST: Uncaught exception - this should be logged and trigger shutdown');
  }, 3000);
};

/**
 * Test 2: Unhandled Rejection Handler
 *
 * This test triggers an unhandled promise rejection to verify:
 * - Rejection is logged with reason and stack trace
 * - Graceful shutdown is initiated
 * - Process exits with code 1
 *
 * To run: Uncomment the test and run the server
 */
export const testUnhandledRejection = () => {
  logger.info('Testing unhandled rejection handler in 3 seconds...');

  setTimeout(() => {
    logger.info('Triggering unhandled rejection now');
    Promise.reject(
      new Error('TEST: Unhandled rejection - this should be logged and trigger shutdown'),
    );
  }, 3000);
};

/**
 * Test 3: Async Unhandled Rejection
 *
 * This test triggers an unhandled rejection from an async function
 */
export const testAsyncUnhandledRejection = () => {
  logger.info('Testing async unhandled rejection in 3 seconds...');

  setTimeout(() => {
    logger.info('Triggering async unhandled rejection now');

    // This async function throws but is not awaited or caught
    (async () => {
      throw new Error(
        'TEST: Async unhandled rejection - this should be logged and trigger shutdown',
      );
    })();
  }, 3000);
};

/**
 * Test 4: Multiple Errors
 *
 * This test verifies that multiple errors don't cause duplicate shutdowns
 */
export const testMultipleErrors = () => {
  logger.info('Testing multiple errors in 3 seconds...');

  setTimeout(() => {
    logger.info('Triggering multiple errors now');

    // First error
    Promise.reject(new Error('TEST: First error'));

    // Second error (should be ignored as shutdown is in progress)
    setTimeout(() => {
      Promise.reject(new Error('TEST: Second error - should be ignored'));
    }, 100);
  }, 3000);
};

/**
 * Manual Test Instructions
 *
 * 1. Uncomment ONE test at a time in server.ts bootstrap function:
 *
 *    import { testUncaughtException } from './tests/error-handlers.test';
 *    testUncaughtException();
 *
 * 2. Start the server:
 *    npm run dev
 *
 * 3. Observe the logs:
 *    - Should see "Testing [error type] handler in 3 seconds..."
 *    - Should see "Triggering [error type] now"
 *    - Should see error logged with full details
 *    - Should see "Starting graceful shutdown..."
 *    - Should see cleanup logs (worker monitor, database, etc.)
 *    - Should see "Shutdown complete"
 *    - Process should exit with code 1
 *
 * 4. Verify exit code:
 *    echo $?  # Should output 1
 *
 * Expected Log Output:
 *
 * [server] INFO Testing uncaught exception handler in 3 seconds...
 * [server] INFO 🚀 SocialFlow Backend is running on http://localhost:3000
 * [server] INFO Triggering uncaught exception now
 * [server] ERROR UNCAUGHT EXCEPTION - Application will terminate {
 *   error: "TEST: Uncaught exception - this should be logged and trigger shutdown",
 *   stack: "Error: TEST: Uncaught exception...\n    at Timeout._onTimeout...",
 *   name: "Error"
 * }
 * [server] INFO Received uncaughtException. Starting graceful shutdown...
 * [server] INFO HTTP server closed
 * [server] INFO Worker monitor stopped
 * [server] INFO Data pruning job stopped
 * [server] INFO Database connections closed
 * [server] INFO Shutdown complete
 */

// Uncomment to run a test (DO NOT commit uncommented):
// testUncaughtException();
// testUnhandledRejection();
// testAsyncUnhandledRejection();
// testMultipleErrors();
