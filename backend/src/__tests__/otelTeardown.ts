/**
 * otelTeardown.ts
 *
 * Flushes buffered OTel spans after all tests in a suite complete.
 * Prevents "span exporter" warnings caused by Jest calling process.exit()
 * before the BatchSpanProcessor drains its queue (issue #710).
 *
 * Registered via setupFilesAfterFramework in jest.config.js so that
 * afterAll is available.
 */

afterAll(async () => {
  try {
    // Dynamically import to avoid initialising the SDK during module load.
    // tracing.ts is excluded from coverage so this import is safe in tests.
    const tracing = await import('../tracing').catch(() => null);
    if (tracing?.shutdownOtel) {
      await tracing.shutdownOtel(3_000);
    }
  } catch {
    // Swallow — a shutdown failure must never fail the test suite.
  }
});
