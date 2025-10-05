const redisClient = require('./redisClient');

const cacheMiddleware = {
  // Cache middleware with configurable duration
  cache: (duration) => {
    return async (req, res, next) => {
      const key = `cache:${req.originalUrl}`;

      try {
        const cachedResponse = await redisClient.get(key);

        if (cachedResponse) {
          return res.json(JSON.parse(cachedResponse));
        }

        // Store original res.json function
        const originalJson = res.json;

        // Override res.json method to cache the response
        res.json = function (data) {
          redisClient.setex(key, duration, JSON.stringify(data));
          return originalJson.call(this, data);
        };

        next();
      } catch (error) {
        console.error('Redis Cache Error:', error);
        next();
      }
    };
  },

  // Clear cache for specific patterns
  clearCache: (patterns) => {
    return async (req, res, next) => {
      try {
        if (Array.isArray(patterns)) {
          for (const pattern of patterns) {
            const keys = await redisClient.keys(`cache:${pattern}`);
            if (keys.length > 0) {
              await redisClient.del(keys);
            }
          }
        }
        next();
      } catch (error) {
        console.error('Redis Clear Cache Error:', error);
        next();
      }
    };
  },
};

module.exports = cacheMiddleware;
