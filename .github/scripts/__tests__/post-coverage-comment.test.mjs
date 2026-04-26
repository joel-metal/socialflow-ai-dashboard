import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fc from 'fast-check';

import {
  loadSummary,
  formatComment,
  checkThresholds,
  THRESHOLDS,
} from '../post-coverage-comment.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal CoverageMetrics total object */
function makeMetrics({ lines = 90, statements = 90, functions = 90, branches = 75 } = {}) {
  const make = (pct, total = 100) => ({ pct, total, covered: Math.round((pct / 100) * total), skipped: 0 });
  return {
    lines: make(lines),
    statements: make(statements),
    functions: make(functions),
    branches: make(branches),
  };
}

/** Write a temporary coverage-summary.json and return its path */
function writeTempSummary(metrics) {
  const dir = mkdirSync(join(tmpdir(), `cov-test-${Date.now()}`), { recursive: true }) || join(tmpdir(), `cov-test-${Date.now()}`);
  const file = join(tmpdir(), `coverage-summary-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify({ total: metrics }), 'utf8');
  return file;
}

// ---------------------------------------------------------------------------
// Unit tests — loadSummary
// ---------------------------------------------------------------------------

describe('loadSummary', () => {
  it('returns parsed total object for a valid JSON file', () => {
    const metrics = makeMetrics();
    const file = writeTempSummary(metrics);
    const result = loadSummary(file);
    assert.deepEqual(result, metrics);
    rmSync(file);
  });

  it('returns null for a non-existent path without throwing', () => {
    const result = loadSummary('/tmp/this-file-does-not-exist-ever-12345.json');
    assert.equal(result, null);
  });
});

// ---------------------------------------------------------------------------
// Unit tests — formatComment
// ---------------------------------------------------------------------------

describe('formatComment', () => {
  it('contains no ⚠️ when all metrics are above threshold', () => {
    const metrics = makeMetrics({ lines: 90, statements: 90, functions: 90, branches: 75 });
    const comment = formatComment(metrics);
    assert.ok(!comment.includes('⚠️'), 'Expected no ⚠️ in comment');
  });

  it('shows ⚠️ on branches row only when branches.pct = 65 (below 70)', () => {
    const metrics = makeMetrics({ lines: 90, statements: 90, functions: 90, branches: 65 });
    const comment = formatComment(metrics);
    const rows = comment.split('\n').filter((l) => l.startsWith('|'));
    const branchRow = rows.find((r) => r.includes('branches'));
    const otherRows = rows.filter((r) => r.includes('lines') || r.includes('statements') || r.includes('functions'));
    assert.ok(branchRow && branchRow.includes('⚠️'), 'branches row should have ⚠️');
    for (const row of otherRows) {
      assert.ok(!row.includes('⚠️'), `Row "${row}" should not have ⚠️`);
    }
  });

  it('shows ⚠️ on all four rows when all metrics are below threshold', () => {
    const metrics = makeMetrics({ lines: 50, statements: 50, functions: 50, branches: 50 });
    const comment = formatComment(metrics);
    const dataRows = comment.split('\n').filter((l) => l.startsWith('|') && !l.includes('Metric') && !l.includes('---'));
    assert.equal(dataRows.length, 4, 'Expected 4 data rows');
    for (const row of dataRows) {
      assert.ok(row.includes('⚠️'), `Row "${row}" should have ⚠️`);
    }
  });

  it('each row matches pattern like "65% (65/100)"', () => {
    const metrics = makeMetrics({ lines: 65, statements: 70, functions: 80, branches: 60 });
    const comment = formatComment(metrics);
    const dataRows = comment.split('\n').filter((l) => l.startsWith('|') && !l.includes('Metric') && !l.includes('---'));
    const pattern = /\d+% \(\d+\/\d+\)/;
    for (const row of dataRows) {
      assert.match(row, pattern, `Row "${row}" should match pct% (covered/total) pattern`);
    }
  });
});

// ---------------------------------------------------------------------------
// Property-based tests
// ---------------------------------------------------------------------------

/** Arbitrary for a single metric entry */
const metricArb = (pctMin = 0, pctMax = 100) =>
  fc.record({
    pct: fc.integer({ min: pctMin, max: pctMax }),
    total: fc.integer({ min: 1, max: 1000 }),
    covered: fc.integer({ min: 0, max: 1000 }),
    skipped: fc.nat(),
  });

/** Arbitrary for a full CoverageMetrics object */
const coverageMetricsArb = fc.record({
  lines: metricArb(),
  statements: metricArb(),
  functions: metricArb(),
  branches: metricArb(),
});

describe('Property-based tests', () => {
  // Feature: ci-coverage-thresholds, Property 1: Threshold violation causes non-zero exit
  it('Property 1: checkThresholds returns passed=false when at least one metric is below threshold', () => {
    // Generate metrics where at least one is below its threshold
    const belowThresholdArb = fc.record({
      lines: metricArb(0, THRESHOLDS.lines - 1),
      statements: metricArb(),
      functions: metricArb(),
      branches: metricArb(),
    });

    fc.assert(
      fc.property(belowThresholdArb, (metrics) => {
        const result = checkThresholds(metrics, THRESHOLDS);
        return result.passed === false;
      }),
      { numRuns: 100 }
    );
  });

  // Feature: ci-coverage-thresholds, Property 4: PR comment metric display
  it('Property 4: formatComment output contains all metric names and pct% (covered/total) pattern', () => {
    fc.assert(
      fc.property(coverageMetricsArb, (metrics) => {
        const comment = formatComment(metrics, THRESHOLDS);
        const hasAllMetrics =
          comment.includes('lines') &&
          comment.includes('statements') &&
          comment.includes('functions') &&
          comment.includes('branches');
        const pattern = /\d+% \(\d+\/\d+\)/;
        const dataRows = comment.split('\n').filter((l) => l.startsWith('|') && !l.includes('Metric') && !l.includes('---'));
        const allRowsMatch = dataRows.every((row) => pattern.test(row));
        return hasAllMetrics && allRowsMatch;
      }),
      { numRuns: 100 }
    );
  });

  // Feature: ci-coverage-thresholds, Property 5: Threshold violation flagging in comment
  it('Property 5: rows with pct < threshold include ⚠️; rows with pct >= threshold do not', () => {
    fc.assert(
      fc.property(coverageMetricsArb, (metrics) => {
        const comment = formatComment(metrics, THRESHOLDS);
        const metricNames = ['lines', 'statements', 'functions', 'branches'];
        for (const name of metricNames) {
          const dataRows = comment.split('\n').filter((l) => l.startsWith('|') && l.includes(name) && !l.includes('---'));
          if (dataRows.length === 0) return false;
          const row = dataRows[0];
          const pct = metrics[name].pct;
          const threshold = THRESHOLDS[name];
          if (pct < threshold) {
            if (!row.includes('⚠️')) return false;
          } else {
            if (row.includes('⚠️')) return false;
          }
        }
        return true;
      }),
      { numRuns: 100 }
    );
  });

  // Feature: ci-coverage-thresholds, Property 6: Missing summary file — comment skipped safely
  it('Property 6: loadSummary returns null for any non-existent file path without throwing', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (suffix) => {
        const fakePath = `/tmp/nonexistent-coverage-${suffix.replace(/[^a-zA-Z0-9]/g, '_')}.json`;
        let result;
        try {
          result = loadSummary(fakePath);
        } catch {
          return false;
        }
        return result === null;
      }),
      { numRuns: 100 }
    );
  });

  // Feature: ci-coverage-thresholds, Property 7: Single source of truth for thresholds
  it('Property 7: jest.config.js coverageThreshold.global deep-equals THRESHOLDS; ci.yml contains no raw threshold numbers outside comments', async () => {
    // Verify jest.config.js thresholds match THRESHOLDS
    const { createRequire } = await import('node:module');
    const { fileURLToPath } = await import('node:url');
    const { dirname, resolve } = await import('node:path');
    const { readFileSync } = await import('node:fs');

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    const require = createRequire(import.meta.url);
    const jestConfigPath = resolve(__dirname, '../../../backend/jest.config.js');
    const jestConfig = require(jestConfigPath);
    const globalThresholds = jestConfig.coverageThreshold.global;

    assert.deepEqual(
      globalThresholds,
      THRESHOLDS,
      'jest.config.js coverageThreshold.global must deep-equal THRESHOLDS'
    );

    // Verify ci.yml does not contain raw threshold numbers outside comments
    const ciYmlPath = resolve(__dirname, '../../../.github/workflows/ci.yml');
    const ciYml = readFileSync(ciYmlPath, 'utf8');
    const lines = ciYml.split('\n');
    const thresholdValues = Object.values(THRESHOLDS).map(String);

    for (const line of lines) {
      const trimmed = line.trim();
      // Skip comment lines
      if (trimmed.startsWith('#')) continue;
      for (const val of thresholdValues) {
        // Check for standalone threshold numbers (not part of version strings like v4, node-version: "20")
        // We look for patterns like ": 80" or "= 80" or "threshold: 80" that would indicate hardcoded thresholds
        const thresholdPattern = new RegExp(`(?:threshold|coverage|lines|statements|functions|branches).*\\b${val}\\b`, 'i');
        assert.ok(
          !thresholdPattern.test(trimmed),
          `ci.yml line contains raw threshold value ${val} outside a comment: "${trimmed}"`
        );
      }
    }
  });
});
