# Docker Image Optimization

## Excluded from Production Images

The following directories and files are excluded from the Docker image via `.dockerignore`:

- `node_modules` - Reinstalled during build
- `dist` - Generated during build
- `logs` and `*.log` - Runtime artifacts
- `.env` and `.env.*` - Environment-specific configs (except `.env.example`)
- `coverage` - Test coverage reports
- `.git` and `.gitignore` - Version control
- `*.md` - Documentation files
- `elk` - Local development ELK stack
- `prisma/migrations` - Schema history (only schema.prisma is needed)
- `backend/src/**/__tests__` and `**/*.test.ts` - Test files

## Benefits

Excluding `prisma/migrations` reduces image size and avoids exposing schema evolution history in production deployments.
