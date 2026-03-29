# Docker Guide

## Overview

The backend uses a **two-stage build**:

| Stage | Base | Purpose |
|---|---|---|
| `builder` | `node:20-alpine` | Installs all deps, compiles TypeScript → `dist/` |
| `runner` | `node:20-alpine` | Copies `dist/`, installs production deps only, runs as non-root |

This keeps the final image small (no TypeScript compiler, no devDependencies) and the runtime user unprivileged.

## Build

```bash
# From the backend/ directory
docker build -t socialflow-backend .

# With a specific tag
docker build -t socialflow-backend:1.0.0 .
```

## Run

```bash
docker run --rm \
  -p 3001:3001 \
  --env-file .env \
  socialflow-backend
```

All required environment variables must be supplied via `--env-file` or individual `-e` flags. See the [README](../README.md) for the full variable reference.

### Minimum required variables

```
DATABASE_URL=postgresql://user:pass@host:5432/db
JWT_SECRET=<min-32-chars>
JWT_REFRESH_SECRET=<min-32-chars>
TWITTER_API_KEY=<key>
TWITTER_API_SECRET=<secret>
```

## Docker Compose (development)

```yaml
services:
  backend:
    build: ./backend
    ports:
      - "3001:3001"
    env_file: ./backend/.env
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      POSTGRES_DB: socialflow

  redis:
    image: redis:7-alpine
```

## Image size verification

```bash
docker images socialflow-backend
```

Expected final image: **< 300 MB** (alpine base + production node_modules + compiled JS only).

## Security notes

- Runs as non-root user `appuser` (UID created at build time).
- `.env` files are excluded from the build context via `.dockerignore`.
- `NODE_ENV=production` is baked in; override only for staging if needed.
