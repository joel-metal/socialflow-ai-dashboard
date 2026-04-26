import winston from 'winston';
import { getRequestId } from '../middleware/requestId';

const isProduction = process.env.NODE_ENV === 'production';

// Create Winston logger instance
const winstonLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: isProduction
    ? winston.format.json() // JSON format for production (cloud-ready)
    : winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message, scope, requestId, ...meta }) => {
          const reqIdStr = requestId ? ` [${requestId}]` : '';
          const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          return `${timestamp} [${scope || 'app'}]${reqIdStr} ${level}: ${message}${metaStr}`;
        }),
      ),
  transports: [
    new winston.transports.Console(),
    ...(isProduction
      ? [
          new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
          new winston.transports.File({ filename: 'logs/combined.log' }),
        ]
      : []),
  ],
});

export interface Logger {
  info: (message: string, metadata?: unknown) => void;
  warn: (message: string, metadata?: unknown) => void;
  error: (message: string, metadata?: unknown) => void;
}

/**
 * Create a context-aware logger that automatically includes request ID
 * @param scope - The scope/module name for the logger
 */
export const createLogger = (scope: string): Logger => {
  return {
    info: (message, metadata) => {
      const requestId = getRequestId();
      winstonLogger.info(message, { scope, requestId, ...metadata });
    },
    warn: (message, metadata) => {
      const requestId = getRequestId();
      winstonLogger.warn(message, { scope, requestId, ...metadata });
    },
    error: (message, metadata) => {
      const requestId = getRequestId();
      winstonLogger.error(message, { scope, requestId, ...metadata });
    },
  };
};
