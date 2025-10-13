require('dotenv').config();
const express = require('express');
const cors = require('cors');
const {
  authMiddleware,
  sessionMiddleware,
  cookieMiddleware,
  cacheMiddleware,
  logger,
  loggingMiddleware,
  performanceMiddleware,
} = require('.');

// Import routes
const authRoutes = require('./routes/auth');

const app = express();

// Trust proxy headers (needed when running behind reverse proxies / Docker)
app.set('trust proxy', 1);

// CORS configuration for front-end
const defaultOrigins = ['http://localhost:8080', 'http://localhost:8081'];
const envOriginsRaw = process.env.FRONTEND_URLS || process.env.FRONTEND_URL || '';
const envOrigins = envOriginsRaw
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = Array.from(new Set([...defaultOrigins, ...envOrigins]));

const corsMiddleware = cors({
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    logger.warn('Blocked CORS request from unauthorized origin', { origin });
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
});

app.use(corsMiddleware);
app.options('*', corsMiddleware);

// Apply middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieMiddleware);
app.use(sessionMiddleware);

// Apply logging middleware
app.use(loggingMiddleware.httpLogger);
app.use(performanceMiddleware);

// Mount auth routes
app.use('/api/auth', authRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Example protected route
app.get(
  '/api/data',
  authMiddleware.verifyToken,
  loggingMiddleware.routeLogger('info'),
  cacheMiddleware.cache(300),
  (req, res) => {
    logger.info('Fetching data for user', { userId: req.user.id });
    res.json({ data: 'Success' });
  }
);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Error handling
app.use(loggingMiddleware.errorLogger);
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ 
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal Server Error' 
      : err.message 
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Server is shutting down');
  // ... cleanup code ...
  process.exit(0);
});

module.exports = app;

// Start server if this file is run directly (e.g., `node app.js`)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    logger.info(`API server listening on port ${PORT}`, {
      port: PORT,
      env: process.env.NODE_ENV || 'development',
    });
  }).on('error', (error) => {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  });
}
