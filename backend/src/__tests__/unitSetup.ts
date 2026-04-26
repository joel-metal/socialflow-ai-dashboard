// Minimal env vars required by config validation — set before any module loads
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-that-is-at-least-32-chars!!';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret-32-chars!!!!!';
process.env.TWITTER_API_KEY = process.env.TWITTER_API_KEY || 'test-key';
process.env.TWITTER_API_SECRET = process.env.TWITTER_API_SECRET || 'test-secret';