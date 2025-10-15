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
//const computeRoutes = require('./routes/compute');

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

// Mount routes
app.use('/api/auth', authRoutes);
//app.use('/api/compute', computeRoutes);

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
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received, starting graceful shutdown...`);
  
  const shutdownTimeout = setTimeout(() => {
    logger.error('Graceful shutdown timeout, forcing exit');
    process.exit(1);
  }, 30000); // 30 second timeout

  try {
    // Close HTTP server
    if (global.httpServer) {
      logger.info('Closing HTTP server...');
      await new Promise((resolve) => {
        global.httpServer.close(resolve);
      });
      logger.info('✓ HTTP server closed');
    }

    // Close gRPC server
    if (global.grpcServer) {
      logger.info('Closing gRPC server...');
      await new Promise((resolve) => {
        global.grpcServer.tryShutdown(resolve);
      });
      logger.info('✓ gRPC server closed');
    }

    // Close WebSocket server
    if (global.wsServer) {
      logger.info('Closing WebSocket server...');
      global.wsServer.shutdown();
      logger.info('✓ WebSocket server closed');
    }

    // Close Kafka connections
    if (global.kafkaProducer) {
      logger.info('Closing Kafka producer...');
      await global.kafkaProducer.disconnect();
      logger.info('✓ Kafka producer closed');
    }

    if (global.kafkaConsumer) {
      logger.info('Closing Kafka consumer...');
      await global.kafkaConsumer.disconnect();
      logger.info('✓ Kafka consumer closed');
    }

    // Close database pool
    const db = require('./db/postgres');
    if (db && db.pool) {
      logger.info('Closing database connections...');
      await db.close();
      logger.info('✓ Database connections closed');
    }

    // Close Redis connection
    const redis = require('./redisClient');
    if (redis && redis.client) {
      logger.info('Closing Redis connection...');
      await redis.client.quit();
      logger.info('✓ Redis connection closed');
    }

    clearTimeout(shutdownTimeout);
    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown', { error: error.message });
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection', { reason, promise });
});

module.exports = app;

// Start server if this file is run directly (e.g., `node app.js`)
if (require.main === module) {
  const http = require('http');
  const PORT = process.env.PORT || 3000;
  const GRPC_PORT = process.env.GRPC_PORT || 50051;
  
  // Create HTTP server
  const httpServer = http.createServer(app);
  global.httpServer = httpServer; // Store for graceful shutdown
  
  // Initialize Kafka feeder (optional)
  if (process.env.KAFKA_ENABLED === 'true') {
    try {
      const feeder = require('./kafka/feeder');
      feeder.init().then(() => {
        global.kafkaProducer = require('./kafka/producer');
        global.kafkaConsumer = require('./kafka/consumer');
      }).catch(err => {
        logger.warn('Kafka feeder not started', { error: err.message });
      });
    } catch (error) {
      logger.warn('Kafka modules not found, skipping Kafka initialization');
    }
  }

  // Start HTTP server
  httpServer.listen(PORT, () => {
    logger.info(`HTTP API server listening on port ${PORT}`, {
      port: PORT,
      env: process.env.NODE_ENV || 'development',
    });
  }).on('error', (error) => {
    logger.error('Failed to start HTTP server', { error: error.message });
    process.exit(1);
  });

  // Start gRPC server (optional)
  if (process.env.ENABLE_GRPC !== 'false') {
    try {
      const { startGrpcServer } = require('./grpc/server');
      const grpcServer = startGrpcServer(GRPC_PORT);
      logger.info(`gRPC server enabled on port ${GRPC_PORT}`);
      
      // Store for graceful shutdown
      global.grpcServer = grpcServer;
    } catch (error) {
      logger.warn('gRPC server not started', { error: error.message });
    }
  }

  // Start WebSocket server (optional)
  if (process.env.ENABLE_WS !== 'false') {
    try {
      const WebSocketServer = require('./websocket/server');
      const wsServer = new WebSocketServer(httpServer);
      wsServer.startHeartbeat();
      logger.info('WebSocket server enabled on /ws');
      
      // Store for graceful shutdown and routes
      global.wsServer = wsServer;
    } catch (error) {
      logger.warn('WebSocket server not started', { error: error.message });
    }
  }

  // Enhanced graceful shutdown
  const shutdown = async () => {
    logger.info('🛑 Shutdown signal received, initiating graceful shutdown...');
    
    const shutdownTimeout = setTimeout(() => {
      logger.error('❌ Graceful shutdown timeout exceeded, forcing exit');
      process.exit(1);
    }, 30000); // 30 second timeout

    try {
      // Close HTTP server (stop accepting new connections)
      if (httpServer) {
        logger.info('Closing HTTP server...');
        await new Promise((resolve) => {
          httpServer.close(() => {
            logger.info('✓ HTTP server closed');
            resolve();
          });
        });
      }

      // Close gRPC server
      if (global.grpcServer) {
        logger.info('Closing gRPC server...');
        await new Promise((resolve) => {
          global.grpcServer.tryShutdown(() => {
            logger.info('✓ gRPC server closed');
            resolve();
          });
        });
      }

      // Close WebSocket server
      if (global.wsServer) {
        logger.info('Closing WebSocket connections...');
        global.wsServer.shutdown();
        logger.info('✓ WebSocket server closed');
      }

      // Close Kafka connections
      if (global.kafkaProducer) {
        logger.info('Flushing and closing Kafka producer...');
        await global.kafkaProducer.disconnect();
        logger.info('✓ Kafka producer closed');
      }

      if (global.kafkaConsumer) {
        logger.info('Closing Kafka consumer...');
        await global.kafkaConsumer.disconnect();
        logger.info('✓ Kafka consumer closed');
      }

      // Close database pool
      logger.info('Closing database connections...');
      const db = require('./db/postgres');
      if (db && db.close) {
        await db.close();
        logger.info('✓ Database connections closed');
      }

      // Close Redis connection
      try {
        const redis = require('./redisClient');
        if (redis && redis.client) {
          logger.info('Closing Redis connection...');
          await redis.client.quit();
          logger.info('✓ Redis connection closed');
        }
      } catch (err) {
        logger.warn('Redis not initialized or already closed');
      }

      // Kill any running child processes
      try {
        const taskRunner = require('./orchestration/taskRunner');
        logger.info('Terminating child processes...');
        taskRunner.killAll();
        logger.info('✓ Child processes terminated');
      } catch (err) {
        logger.warn('Task runner not initialized');
      }

      clearTimeout(shutdownTimeout);
      logger.info('✅ Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('❌ Error during graceful shutdown', { 
        error: error.message,
        stack: error.stack 
      });
      clearTimeout(shutdownTimeout);
      process.exit(1);
    }
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  
  // Log successful startup
  logger.info('🚀 Application initialized successfully', {
    port: PORT,
    grpc: process.env.ENABLE_GRPC !== 'false',
    websocket: process.env.ENABLE_WS !== 'false',
    kafka: process.env.KAFKA_ENABLED !== 'false',
  });
}
