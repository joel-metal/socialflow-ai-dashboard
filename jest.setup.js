const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Polyfill crypto.getRandomValues for @noble/hashes in Node test environment
const { webcrypto } = require('crypto');
if (!global.crypto) {
  global.crypto = webcrypto;
}
