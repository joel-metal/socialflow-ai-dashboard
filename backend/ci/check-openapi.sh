#!/usr/bin/env bash
# ci/check-openapi.sh
#
# Fails if the committed openapi.yaml diverges from what swagger-jsdoc generates.
# Run from the repo root: bash backend/ci/check-openapi.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Regenerating openapi.yaml..."
npm run generate:openapi

if ! git diff --exit-code openapi.yaml; then
  echo ""
  echo "ERROR: openapi.yaml is out of date."
  echo "Run 'npm run generate:openapi' in the backend directory and commit the result."
  exit 1
fi

echo "openapi.yaml is up to date."
