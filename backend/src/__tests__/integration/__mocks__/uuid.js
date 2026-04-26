// CJS shim for uuid v13 (ESM-only) — delegates to Node's built-in crypto
const { randomUUID } = require('crypto');
module.exports = { v4: randomUUID, v1: randomUUID };
