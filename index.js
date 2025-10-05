const authMiddleware = require('./authMiddleware');
const sessionMiddleware = require('./sessionMiddleware');
const cookieMiddleware = require('./cookieMiddleware');
const cacheMiddleware = require('./cacheMiddleware');
const redisClient = require('./redisClient');
const logger = require('./logger/winstonConfig');
const loggingMiddleware = require('./logger/loggingMiddleware');
const performanceMiddleware = require('./logger/performanceMiddleware');

module.exports = {
  authMiddleware,
  sessionMiddleware,
  cookieMiddleware,
  cacheMiddleware,
  redisClient,
  logger,
  loggingMiddleware,
  performanceMiddleware,
};
