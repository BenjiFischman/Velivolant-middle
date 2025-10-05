const logger = require('./winstonConfig');

const performanceMiddleware = (req, res, next) => {
  const start = process.hrtime();

  // Override res.end to calculate response time
  const originalEnd = res.end;
  res.end = function (...args) {
    const [seconds, nanoseconds] = process.hrtime(start);
    const responseTime = seconds * 1000 + nanoseconds / 1000000;

    logger.info({
      type: 'performance',
      path: req.path,
      method: req.method,
      responseTime: `${responseTime.toFixed(2)}ms`,
      status: res.statusCode,
    });

    originalEnd.apply(res, args);
  };

  next();
};

module.exports = performanceMiddleware;
