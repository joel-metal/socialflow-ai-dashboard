/**
 * Generates openapi.yaml from the swagger-jsdoc spec.
 * Run via: npm run generate:openapi
 *
 * Used in CI to verify the committed file matches the generated spec:
 *   npm run generate:openapi && git diff --exit-code openapi.yaml
 */
import fs from 'fs';
import path from 'path';
import { swaggerSpec } from '../src/config/swagger';

// JSON is valid YAML — write as formatted JSON so standard YAML parsers accept it
// and the file is diffable in git.
const outPath = path.resolve(__dirname, '../openapi.yaml');
fs.writeFileSync(outPath, JSON.stringify(swaggerSpec, null, 2), 'utf8');
console.log(`openapi.yaml written to ${outPath}`);
