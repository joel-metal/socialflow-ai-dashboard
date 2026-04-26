import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { requestIdMiddleware } from './middleware/requestId';
import { errorHandler, notFoundHandler } from './middleware/error';
import ttsRoutes from './routes/tts';
import twitterWebhookRoutes from './routes/twitter-webhook';

const app: Application = express();

// Security middleware
app.use(helmet());

// CORS
app.use(cors());

// Request ID middleware (must be first to ensure all logs have request ID)
app.use(requestIdMiddleware);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware (after request ID so logs include the ID)
app.use(morgan('combined'));

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/tts', ttsRoutes);
app.use('/api/twitter-webhook', twitterWebhookRoutes);

// 404 handler - must be after all routes
app.use(notFoundHandler);

// Global error handler - must be last
app.use(errorHandler);

export default app;
