# CI Migration Validation

## Overview

The `.github/workflows/migrations.yml` workflow validates database migrations on both pull requests and pushes to main.

## Trigger Configuration

```yaml
on:
  pull_request:
    paths:
      - 'backend/prisma/migrations/**'
      - 'backend/prisma/schema.prisma'
  push:
    branches:
      - main
    paths:
      - 'backend/prisma/migrations/**'
      - 'backend/prisma/schema.prisma'
```

## Benefits

- Catches schema conflicts before merge rather than after
- Validates migrations against a test PostgreSQL database
- Runs on every PR targeting main that modifies schema or migrations
- Prevents broken migrations from reaching production
