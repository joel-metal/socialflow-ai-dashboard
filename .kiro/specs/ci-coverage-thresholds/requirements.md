# Requirements Document

## Introduction

This feature configures Jest to generate code coverage reports and enforces minimum coverage thresholds for all pull requests in the socialflow-ai-dashboard backend. The CI pipeline will fail if coverage drops below defined thresholds, publish coverage reports as GitHub Actions artifacts, and post a transparent coverage summary comment on every PR. The goal is to maintain code quality and give developers immediate, visible feedback on coverage impact for every change.

## Glossary

- **CI_Pipeline**: The GitHub Actions workflow that runs on pull requests and branch pushes.
- **Coverage_Report**: The output produced by Jest's coverage instrumentation, including line, statement, function, and branch metrics.
- **Coverage_Threshold**: The minimum acceptable percentage for a given coverage metric (lines, statements, functions, branches).
- **Jest_Config**: The `jest.config.js` file in the `backend/` directory that controls Jest behavior.
- **Artifact**: A file or directory uploaded to GitHub Actions for later download or inspection.
- **PR_Comment**: A comment posted automatically to a GitHub pull request by the CI_Pipeline.
- **Coverage_Summary**: The `coverage-summary.json` file produced by Jest's `json-summary` reporter, containing total and per-file metrics.
- **Threshold_Violation**: A condition where one or more coverage metrics fall below the defined Coverage_Threshold values.

---

## Requirements

### Requirement 1: Coverage Threshold Enforcement in Jest

**User Story:** As a developer, I want Jest to enforce minimum coverage thresholds, so that the test suite fails locally and in CI when coverage drops below acceptable levels.

#### Acceptance Criteria

1. THE Jest_Config SHALL define a `coverageThreshold` with a global minimum of 80% for lines, 80% for statements, 80% for functions, and 70% for branches.
2. WHEN Jest runs with the `--coverage` flag and a Threshold_Violation occurs, THE Jest_Config SHALL cause the Jest process to exit with a non-zero exit code.
3. THE Jest_Config SHALL collect coverage from all `src/**/*.ts` files, excluding type declaration files (`*.d.ts`), entry point files (`server.ts`, `tracing.ts`), and generated files.
4. THE Jest_Config SHALL produce coverage output in `text`, `lcov`, `html`, and `json-summary` formats to the `coverage/` directory.

### Requirement 2: CI Build Failure on Threshold Violation

**User Story:** As a team lead, I want the CI build to fail automatically when coverage drops below the threshold, so that low-coverage code cannot be merged into protected branches.

#### Acceptance Criteria

1. WHEN the CI_Pipeline runs on a pull request and a Threshold_Violation occurs, THE CI_Pipeline SHALL exit with a non-zero status code, blocking the PR from merging.
2. WHEN the CI_Pipeline runs the test step and Jest exits with a non-zero code due to a Threshold_Violation, THE CI_Pipeline SHALL surface the failure in the GitHub Actions job summary.
3. THE CI_Pipeline SHALL run coverage checks using the `npm run test:ci` script, which passes `--coverage --ci --forceExit` flags to Jest.
4. IF the `coverage-summary.json` file is not produced (e.g., all tests fail before coverage collection), THEN THE CI_Pipeline SHALL still fail the build and SHALL NOT post a misleading coverage comment.

### Requirement 3: Coverage Report Artifact Publishing

**User Story:** As a developer, I want coverage reports published as CI artifacts, so that I can download and inspect detailed HTML coverage reports for any PR or branch build.

#### Acceptance Criteria

1. WHEN the CI_Pipeline completes a coverage run (regardless of pass or fail), THE CI_Pipeline SHALL upload the entire `backend/coverage/` directory as a GitHub Actions Artifact named `coverage-report`.
2. THE CI_Pipeline SHALL retain the coverage Artifact for a minimum of 30 days.
3. THE Artifact SHALL include the HTML report, LCOV data, and the `coverage-summary.json` file.
4. WHEN the CI_Pipeline uploads the Artifact, THE CI_Pipeline SHALL use `actions/upload-artifact@v4` or a later compatible version.

### Requirement 4: PR Coverage Summary Comment

**User Story:** As a developer, I want a coverage summary posted as a PR comment on every pull request, so that I can see the impact of my changes on coverage without leaving GitHub.

#### Acceptance Criteria

1. WHEN the CI_Pipeline runs on a pull request and the `coverage-summary.json` file exists, THE CI_Pipeline SHALL post a PR_Comment containing a formatted table of line, statement, function, and branch coverage percentages.
2. THE PR_Comment SHALL display each metric as a percentage alongside the covered and total counts (e.g., `82% (410/500)`).
3. WHEN a Threshold_Violation occurs, THE PR_Comment SHALL clearly indicate which metrics are below threshold.
4. IF the `coverage-summary.json` file does not exist, THEN THE CI_Pipeline SHALL skip posting the PR_Comment and SHALL NOT fail the workflow step due to the missing file.
5. THE CI_Pipeline SHALL post the PR_Comment using `actions/github-script` with the pull request's issue number derived from the workflow event context.

### Requirement 5: Coverage Script Availability

**User Story:** As a developer, I want a dedicated npm script to run coverage locally, so that I can verify coverage thresholds before pushing changes.

#### Acceptance Criteria

1. THE Jest_Config's parent `package.json` SHALL expose a `test:coverage` script that runs Jest with the `--coverage` flag.
2. THE Jest_Config's parent `package.json` SHALL expose a `test:ci` script that runs Jest with `--coverage --ci --forceExit` flags suitable for non-interactive CI environments.
3. WHEN a developer runs `npm run test:coverage` locally and a Threshold_Violation occurs, THE script SHALL exit with a non-zero code and print the threshold failure details to stdout.

### Requirement 6: Coverage Threshold Round-Trip Consistency

**User Story:** As a developer, I want the coverage thresholds defined in `jest.config.js` to be the single source of truth, so that local runs and CI runs enforce identical thresholds.

#### Acceptance Criteria

1. THE Jest_Config SHALL be the sole location where Coverage_Threshold values are defined; the CI_Pipeline SHALL not redefine or override thresholds via CLI flags.
2. WHEN the Jest_Config is updated with new threshold values, THE CI_Pipeline SHALL automatically enforce the updated thresholds on the next run without requiring changes to the workflow file.
3. FOR ALL coverage runs (local and CI), the same `jest.config.js` file SHALL be used, ensuring that a passing local run implies a passing CI run for coverage thresholds.
