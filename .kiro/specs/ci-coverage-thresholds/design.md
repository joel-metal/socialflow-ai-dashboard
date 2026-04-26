# Design Document: CI Coverage Thresholds

## Overview

This feature enforces minimum Jest code coverage thresholds for the `socialflow-ai-dashboard` backend, integrates coverage reporting into the GitHub Actions CI pipeline, and surfaces coverage results directly on pull requests. The design leverages Jest's built-in `coverageThreshold` configuration as the single source of truth, with the CI pipeline consuming that configuration without duplicating threshold values.

The existing `ci.yml` workflow already contains a `coverage` job skeleton. This design formalises and completes that job to fully satisfy all requirements.

## Architecture

```mermaid
flowchart TD
    PR[Pull Request / Push] --> CI[GitHub Actions: coverage job]
    CI --> INSTALL[npm ci]
    INSTALL --> PRISMA[npx prisma generate]
    PRISMA --> TESTS[npm run test:ci\njest --coverage --ci --forceExit]
    TESTS -->|exit 0| PASS[Coverage passes thresholds]
    TESTS -->|exit non-zero| FAIL[Coverage below threshold\nor test failure]
    PASS --> ARTIFACT[upload-artifact@v4\nbackend/coverage/ → coverage-report\nretention: 30 days]
    FAIL --> ARTIFACT
    ARTIFACT --> COMMENT{coverage-summary.json\nexists?}
    COMMENT -->|yes| POST[Post PR comment\nwith metrics table\n+ threshold violation flags]
    COMMENT -->|no| SKIP[Skip comment\nstep exits 0]
    POST --> DONE[Job complete]
    SKIP --> DONE
```

The flow is linear within a single job. Jest is the sole enforcer of thresholds — the CI pipeline does not re-check or override them.

## Components and Interfaces

### 1. `backend/jest.config.js`

The existing file already contains the correct `coverageThreshold`, `collectCoverageFrom`, `coverageReporters`, and `coverageDirectory` settings. No structural changes are needed; the design documents the required state:

| Key | Required value |
|-----|---------------|
| `coverageThreshold.global.lines` | `80` |
| `coverageThreshold.global.statements` | `80` |
| `coverageThreshold.global.functions` | `80` |
| `coverageThreshold.global.branches` | `70` |
| `collectCoverageFrom` | `['src/**/*.ts', '!src/**/*.d.ts', '!src/server.ts', '!src/tracing.ts']` |
| `coverageReporters` | `['text', 'lcov', 'html', 'json-summary']` |
| `coverageDirectory` | `'coverage'` |

### 2. `backend/package.json` — npm scripts

| Script | Command |
|--------|---------|
| `test:coverage` | `jest --runInBand --coverage` |
| `test:ci` | `jest --runInBand --coverage --ci --forceExit` |

Both scripts already exist. No changes required.

### 3. `.github/workflows/ci.yml` — `coverage` job

The job contains these steps in order:

| Step | Action / Command | `if` condition |
|------|-----------------|----------------|
| Checkout | `actions/checkout@v4` | always |
| Setup Node 20 | `actions/setup-node@v4` | always |
| Install deps | `npm ci` (root) | always |
| Prisma generate | `npx prisma generate` (backend/) | always |
| Run tests | `npm run test:ci` (backend/) | always |
| Upload artifact | `actions/upload-artifact@v4` | `always()` |
| Post PR comment | `actions/github-script@v7` | `always()` |

The `always()` condition on the upload and comment steps ensures artifacts are published and comments are attempted even when the test step fails (threshold violation).

### 4. Coverage PR Comment

The comment script reads `backend/coverage/coverage-summary.json`. If the file is absent the script returns early (exit 0). When present it:

1. Reads `total` metrics for lines, statements, functions, branches.
2. Formats each as `pct% (covered/total)`.
3. Compares each metric against the known thresholds (80/80/80/70) and appends a ⚠️ indicator when below threshold.
4. Posts the comment only when `context.eventName === 'pull_request'`.

The thresholds used in the comment script for display purposes are hardcoded constants matching `jest.config.js`. They are used only for visual flagging in the comment — Jest itself is the authoritative enforcer.

## Data Models

### `coverage-summary.json` (Jest output)

```typescript
interface CoverageSummary {
  total: CoverageMetrics;
  [filePath: string]: CoverageMetrics;
}

interface CoverageMetrics {
  lines:      { total: number; covered: number; skipped: number; pct: number };
  statements: { total: number; covered: number; skipped: number; pct: number };
  functions:  { total: number; covered: number; skipped: number; pct: number };
  branches:   { total: number; covered: number; skipped: number; pct: number };
}
```

Only the `total` key is consumed by the PR comment script.

### Threshold constants (comment script)

```javascript
const THRESHOLDS = { lines: 80, statements: 80, functions: 80, branches: 70 };
```

These mirror `jest.config.js` and are used solely for the ⚠️ display flag in the PR comment.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Threshold violation causes non-zero exit

*For any* Jest run with `--coverage` where at least one coverage metric (lines, statements, functions, or branches) falls below its configured threshold, the Jest process SHALL exit with a non-zero exit code.

**Validates: Requirements 1.2, 2.1, 2.2**

---

### Property 2: Coverage collection scope

*For any* TypeScript source file under `src/` that is not a `.d.ts`, `server.ts`, or `tracing.ts` file, that file SHALL appear in the coverage report when Jest runs with `--coverage`.

**Validates: Requirements 1.3**

---

### Property 3: Coverage report format completeness

*For any* successful coverage run, the `coverage/` directory SHALL contain files corresponding to all four configured reporters: a text summary on stdout, an `lcov.info` file, an `index.html` file, and a `coverage-summary.json` file.

**Validates: Requirements 1.4, 3.3**

---

### Property 4: PR comment metric display

*For any* `coverage-summary.json` with valid total metrics, the generated PR comment body SHALL contain a formatted percentage and covered/total count for each of the four metrics (lines, statements, functions, branches).

**Validates: Requirements 4.1, 4.2**

---

### Property 5: Threshold violation flagging in comment

*For any* coverage metric whose `pct` value is strictly less than its configured threshold, the PR comment SHALL include a visual indicator (⚠️) for that metric.

**Validates: Requirements 4.3**

---

### Property 6: Missing summary file — comment skipped safely

*For any* CI run where `coverage-summary.json` does not exist, the comment step SHALL exit with code 0 and SHALL NOT post a comment.

**Validates: Requirements 2.4, 4.4**

---

### Property 7: Single source of truth for thresholds

*For any* update to `coverageThreshold` values in `jest.config.js`, the next CI run SHALL enforce the updated thresholds without any change to the workflow YAML file.

**Validates: Requirements 6.1, 6.2, 6.3**

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| Jest exits non-zero (threshold violation) | CI step fails; artifact upload and comment steps still run (`always()`) |
| Jest exits non-zero (test failure before coverage) | Same as above; `coverage-summary.json` absent; comment step skips gracefully |
| `coverage-summary.json` absent | Comment script returns early, exits 0; no comment posted |
| `actions/upload-artifact` fails | Job fails; does not block the threshold enforcement result |
| Workflow runs on `push` (not PR) | Comment script checks `context.eventName`; skips `createComment` call silently |
| `GITHUB_TOKEN` lacks `issues: write` | `createComment` throws; step fails — workflow permissions must include `issues: write` or `pull-requests: write` |

The workflow job must declare:
```yaml
permissions:
  contents: read
  pull-requests: write
```

## Testing Strategy

### Unit tests

Unit tests are appropriate for the comment-generation logic (the JavaScript inside `actions/github-script`). Because this logic lives inline in YAML, it should be extracted to a standalone script file (e.g., `.github/scripts/post-coverage-comment.mjs`) that can be imported and tested independently.

Test cases:
- Given a valid summary with all metrics above threshold → comment body contains no ⚠️
- Given a summary where `branches.pct = 65` (below 70) → comment body contains ⚠️ on branches row only
- Given a summary where all metrics are below threshold → all four rows contain ⚠️
- Given a missing file path → function returns `null` / empty string without throwing

### Property-based tests

Property-based testing is used to verify the comment formatter across the full space of valid metric values.

Library: **fast-check** (already available in the Node ecosystem; add as a dev dependency).

Minimum iterations per property test: **100**.

Each test is tagged with a comment in the format:
`// Feature: ci-coverage-thresholds, Property <N>: <property_text>`

**Property test 1** — Threshold violation causes non-zero exit
```
// Feature: ci-coverage-thresholds, Property 1: Threshold violation causes non-zero exit
```
Generate random coverage metric objects where at least one metric is below threshold. Assert that `checkThresholds(metrics, THRESHOLDS)` returns a non-passing result.

**Property test 4** — PR comment metric display
```
// Feature: ci-coverage-thresholds, Property 4: PR comment metric display
```
For any randomly generated `CoverageMetrics` object with valid numeric fields, assert that `formatComment(metrics)` contains the string `lines`, `statements`, `functions`, and `branches`, and that each row contains the pattern `N% (M/T)`.

**Property test 5** — Threshold violation flagging in comment
```
// Feature: ci-coverage-thresholds, Property 5: Threshold violation flagging in comment
```
For any metric where `pct < threshold`, assert that `formatComment(metrics, THRESHOLDS)` includes `⚠️` in the corresponding row. For any metric where `pct >= threshold`, assert the row does not include `⚠️`.

**Property test 6** — Missing summary file — comment skipped safely
```
// Feature: ci-coverage-thresholds, Property 6: Missing summary file — comment skipped safely
```
For any file path that does not exist on disk, assert that `loadSummary(path)` returns `null` without throwing.

**Property test 7** — Single source of truth for thresholds
```
// Feature: ci-coverage-thresholds, Property 7: Single source of truth for thresholds
```
For any valid threshold configuration object, assert that `jest.config.js` exports a `coverageThreshold.global` object that deep-equals the expected thresholds, and that no threshold values appear in the workflow YAML file.
