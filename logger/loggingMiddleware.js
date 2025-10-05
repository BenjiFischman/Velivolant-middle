const morgan = require('morgan');
const logger = require('./winstonConfig');

// Create a custom morgan token for request body
morgan.token('body', (req) => JSON.stringify(req.body));

// Create a custom morgan format
const morganFormat =
  ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :body';

const loggingMiddleware = {
  // HTTP request logging
  httpLogger: morgan(morganFormat, {
    stream: {
      write: (message) => logger.http(message.trim()),
    },
  }),

  // Error logging middleware
  errorLogger: (err, req, res, next) => {
    logger.error({
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
      body: req.body,
      user: req.user?.id || 'anonymous',
    });
    next(err);
  },

  // Custom logger methods
  routeLogger: (level = 'info') => {
    return (req, res, next) => {
      const logData = {
        path: req.path,
        method: req.method,
        query: req.query,
        body: req.body,
        user: req.user?.id || 'anonymous',
        timestamp: new Date().toISOString(),
      };

      logger[level](logData);
      next();
    };
  },
};

module.exports = loggingMiddleware;
