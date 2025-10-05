require('dotenv').config();
const express = require('express');
const {
  authMiddleware,
  sessionMiddleware,
  cookieMiddleware,
  cacheMiddleware,
  logger,
  loggingMiddleware,
  performanceMiddleware,
} = require('.');

const app = express();

// Apply middleware
app.use(express.json());
app.use(cookieMiddleware);
app.use(sessionMiddleware);

// Apply logging middleware
app.use(loggingMiddleware.httpLogger);
app.use(performanceMiddleware);

// Example route with custom logging
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

// Error handling
app.use(loggingMiddleware.errorLogger);
app.use((err, req, res, next) => {
  res.status(500).json({ error: 'Internal Server Error' });
  next();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('Server is shutting down');
  // ... cleanup code ...
});
