# Backend Testing Guide

## Test project matrix

The Jest config defines four isolated projects. Each targets a distinct file pattern and has its own timeout and environment.

| Project | Pattern | Timeout | Needs live DB? | Command |
|---------|---------|---------|----------------|---------|
| `unit` | `**/__tests__/*.test.ts`, `**/tests/**/*.test.ts`, `**/services/__tests__/**/*.test.ts` | default (5 s) | No | `npm test -- --selectProjects unit` |
| `e2e` | `**/__tests__/integration/*.e2e.test.ts` | 15 s | No (in-process app) | `npm test -- --selectProjects e2e` |
| `db` | `**/__tests__/database/*.db.test.ts` | 30 s | **Yes** | `npm run test:db` |
| `mocks` | `**/__tests__/mocks/*.mock.test.ts` | 10 s | No | `npm run test:mocks` |

Run all projects at once:

```bash
npm test                  # all projects, serial (--runInBand)
npm run test:coverage     # all projects + coverage report
npm run test:ci           # CI mode: coverage + --forceExit
```

Run a single file or pattern:

```bash
npm test -- --selectProjects unit --testPathPattern="auth"
```

Run the config service with 100 % coverage gate:

```bash
npx jest --testPathPatterns="config/__tests__/config.test.ts" \
         --coverage \
         --collectCoverageFrom="src/config/config.ts"
```

---

## Docker test database

The `db` project requires a real Postgres instance. A throwaway container is provided via `docker-compose.test.yml`. It uses a `tmpfs` mount so data is discarded on every `down`.

### Start

```bash
# From backend/
npm run test:db:up
```

This runs:
1. `docker compose -f docker-compose.test.yml up -d --wait` — starts `postgres-test` on port **5433** and waits for the healthcheck to pass.
2. `npx prisma migrate deploy` against `TEST_DATABASE_URL` — applies all pending migrations.

### Run db tests

```bash
npm run test:db
```

`TEST_DATABASE_URL` is set automatically by the script. You can override it:

```bash
TEST_DATABASE_URL=postgresql://user:pass@host:5433/mydb npm run test:db
```

### Teardown

```bash
npm run test:db:down
```

Stops and removes the container. Because the volume is `tmpfs`, no cleanup of leftover data is needed.

### Full db test cycle (one-liner)

```bash
npm run test:db:up && npm run test:db; npm run test:db:down
```

---

## Troubleshooting

### Port 5433 already in use

```
Error: bind: address already in use
```

Find and stop the conflicting process:

```bash
lsof -ti tcp:5433 | xargs kill -9
```

Or change the host port in `docker-compose.test.yml` and update `TEST_DATABASE_URL` accordingly.

---

### Container starts but migrations fail

```
Error: P3009 migrate found failed migrations
```

The `tmpfs` volume is wiped on `down`, so a stale migration state should not persist. If it does:

```bash
npm run test:db:down
npm run test:db:up
```

If the schema itself is broken, reset and re-apply:

```bash
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/socialflow_test \
  npx prisma migrate reset --force
```

---

### `TEST_DATABASE_URL` not set (db tests skipped or wrong DB hit)

The `test:db` script injects the variable automatically. If you run `jest --selectProjects db` directly, set it yourself:

```bash
export TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/socialflow_test
npx jest --selectProjects db --runInBand
```

---

### e2e tests fail with `ECONNREFUSED` on Redis or external services

e2e tests spin up the Express app in-process. Services that require Redis or third-party APIs are mocked via `src/__tests__/integration/__mocks__/`. If a new service is added without a mock, add it to that directory and register it in `jest.config.js` under `moduleNameMapper`.

---

### Unit tests pick up db or e2e files (or vice versa)

Each project's `testMatch` is exclusive by suffix (`.test.ts` vs `.e2e.test.ts` vs `.db.test.ts` vs `.mock.test.ts`). If a file is being matched by the wrong project, check its filename suffix matches the intended project's pattern.

---

### Coverage below threshold

Global thresholds: **80 % lines/statements/functions**, **70 % branches**.

```
Jest: "global" coverage threshold for lines (80%) not met: X%
```

Run with `--coverage` to see the HTML report in `coverage/lcov-report/index.html`, identify uncovered branches, and add tests or adjust thresholds in `jest.config.js` if the gap is intentional.

---

### `ts-jest` compilation errors during test run

```
error TS2307: Cannot find module '...'
```

Ensure `tsconfig.json` paths are reflected in `moduleNameMapper` inside `jest.config.js`. The `diagnostics: false` flag is already set on `e2e`, `db`, and `mocks` projects to suppress type-check noise; add it to `unit` only as a last resort.
