import { CorsOptions } from 'cors';

/**
 * Allowed origins per environment.
 * To add a new origin: append it to the relevant array below.
 *   - local:   development machines / localhost variants
 *   - staging: staging/preview deployments
 *   - prod:    production domains only
 */
const ALLOWED_ORIGINS: Record<string, string[]> = {
  local: ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000'],
  staging: ['https://staging.socialflow.app'],
  prod: ['https://socialflow.app', 'https://www.socialflow.app'],
};

const env = process.env.NODE_ENV ?? 'local';
const allowedOrigins: string[] = ALLOWED_ORIGINS[env] ?? ALLOWED_ORIGINS.local;

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allow server-to-server requests (no Origin header) only outside production
    if (!origin && env !== 'prod') return callback(null, true);
    if (origin && allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
