# OpenAPI Spec Validation

## Overview

The `backend/ci/check-openapi.sh` script validates that the committed `openapi.yaml` matches the generated specification from the codebase.

## How It Works

```bash
#!/usr/bin/env bash
# Regenerate openapi.yaml from source code
npm run generate:openapi

# Compare committed spec with generated spec
if ! git diff --exit-code openapi.yaml; then
  echo "ERROR: openapi.yaml is out of date."
  exit 1
fi
```

## Benefits

- Detects stale OpenAPI documentation before merge
- Ensures API documentation stays in sync with implementation
- Fails CI if the committed spec diverges from generated spec
- Prevents documentation drift in production

## Usage

Run locally before committing:
```bash
cd backend
npm run generate:openapi
```

The CI pipeline automatically runs this check on pull requests.
