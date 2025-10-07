const cacheMiddleware = require('../cacheMiddleware');
const redisClient = require('../redisClient');

// Mock Redis client
jest.mock('../redisClient', () => ({
  get: jest.fn(),
  setex: jest.fn(),
  keys: jest.fn(),
  del: jest.fn(),
}));

describe('cacheMiddleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      originalUrl: '/api/data',
    };
    res = {
      json: jest.fn(),
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  describe('cache', () => {
    it('should return cached response if available', async () => {
      const cachedData = { data: 'cached' };
      redisClient.get.mockResolvedValue(JSON.stringify(cachedData));

      const middleware = cacheMiddleware.cache(300);
      await middleware(req, res, next);

      expect(redisClient.get).toHaveBeenCalledWith('cache:/api/data');
      expect(res.json).toHaveBeenCalledWith(cachedData);
      expect(next).not.toHaveBeenCalled();
    });

    it('should cache response if not in cache', async () => {
      redisClient.get.mockResolvedValue(null);
      const responseData = { data: 'new' };
      
      const middleware = cacheMiddleware.cache(300);
      await middleware(req, res, next);

      expect(redisClient.get).toHaveBeenCalledWith('cache:/api/data');
      expect(next).toHaveBeenCalled();

      // Simulate route handler calling res.json
      res.json(responseData);

      expect(redisClient.setex).toHaveBeenCalledWith(
        'cache:/api/data',
        300,
        JSON.stringify(responseData)
      );
    });

    it('should use custom cache duration', async () => {
      redisClient.get.mockResolvedValue(null);
      const responseData = { data: 'test' };
      
      const middleware = cacheMiddleware.cache(600);
      await middleware(req, res, next);

      res.json(responseData);

      expect(redisClient.setex).toHaveBeenCalledWith(
        'cache:/api/data',
        600,
        JSON.stringify(responseData)
      );
    });

    it('should handle Redis errors gracefully', async () => {
      const error = new Error('Redis connection failed');
      redisClient.get.mockRejectedValue(error);
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const middleware = cacheMiddleware.cache(300);
      await middleware(req, res, next);

      expect(consoleSpy).toHaveBeenCalledWith('Redis Cache Error:', error);
      expect(next).toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should create unique cache keys for different URLs', async () => {
      redisClient.get.mockResolvedValue(null);

      req.originalUrl = '/api/users';
      const middleware1 = cacheMiddleware.cache(300);
      await middleware1(req, res, next);
      expect(redisClient.get).toHaveBeenCalledWith('cache:/api/users');

      req.originalUrl = '/api/posts';
      const middleware2 = cacheMiddleware.cache(300);
      await middleware2(req, res, next);
      expect(redisClient.get).toHaveBeenCalledWith('cache:/api/posts');
    });

    it('should preserve original res.json behavior', async () => {
      redisClient.get.mockResolvedValue(null);
      const responseData = { data: 'test' };
      
      // Set up res.json to return a value
      res.json = jest.fn().mockReturnValue(responseData);
      
      const middleware = cacheMiddleware.cache(300);
      await middleware(req, res, next);

      const result = res.json(responseData);

      expect(result).toBeDefined();
      expect(redisClient.setex).toHaveBeenCalled();
    });

    it('should handle complex objects in cache', async () => {
      const complexData = {
        user: { id: 1, name: 'John' },
        posts: [{ id: 1 }, { id: 2 }],
        metadata: { timestamp: Date.now() },
      };
      redisClient.get.mockResolvedValue(JSON.stringify(complexData));

      const middleware = cacheMiddleware.cache(300);
      await middleware(req, res, next);

      expect(res.json).toHaveBeenCalledWith(complexData);
    });
  });

  describe('clearCache', () => {
    it('should clear cache for single pattern', async () => {
      const keys = ['cache:/api/users/1', 'cache:/api/users/2'];
      redisClient.keys.mockResolvedValue(keys);
      redisClient.del.mockResolvedValue(2);

      const middleware = cacheMiddleware.clearCache(['/api/users/*']);
      await middleware(req, res, next);

      expect(redisClient.keys).toHaveBeenCalledWith('cache:/api/users/*');
      expect(redisClient.del).toHaveBeenCalledWith(keys);
      expect(next).toHaveBeenCalled();
    });

    it('should clear cache for multiple patterns', async () => {
      redisClient.keys.mockResolvedValueOnce(['cache:/api/users/1']);
      redisClient.keys.mockResolvedValueOnce(['cache:/api/posts/1']);
      redisClient.del.mockResolvedValue(1);

      const middleware = cacheMiddleware.clearCache(['/api/users/*', '/api/posts/*']);
      await middleware(req, res, next);

      expect(redisClient.keys).toHaveBeenCalledTimes(2);
      expect(redisClient.del).toHaveBeenCalledTimes(2);
      expect(next).toHaveBeenCalled();
    });

    it('should handle empty keys gracefully', async () => {
      redisClient.keys.mockResolvedValue([]);

      const middleware = cacheMiddleware.clearCache(['/api/users/*']);
      await middleware(req, res, next);

      expect(redisClient.keys).toHaveBeenCalled();
      expect(redisClient.del).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    it('should handle Redis errors during clear', async () => {
      const error = new Error('Redis delete failed');
      redisClient.keys.mockRejectedValue(error);
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const middleware = cacheMiddleware.clearCache(['/api/users/*']);
      await middleware(req, res, next);

      expect(consoleSpy).toHaveBeenCalledWith('Redis Clear Cache Error:', error);
      expect(next).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle non-array patterns', async () => {
      const middleware = cacheMiddleware.clearCache('not-an-array');
      await middleware(req, res, next);

      expect(redisClient.keys).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    it('should clear all matching keys even with large number', async () => {
      const keys = Array.from({ length: 100 }, (_, i) => `cache:/api/item/${i}`);
      redisClient.keys.mockResolvedValue(keys);
      redisClient.del.mockResolvedValue(100);

      const middleware = cacheMiddleware.clearCache(['/api/item/*']);
      await middleware(req, res, next);

      expect(redisClient.del).toHaveBeenCalledWith(keys);
      expect(next).toHaveBeenCalled();
    });
  });
});
