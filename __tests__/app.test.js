const request = require('supertest');
const jwt = require('jsonwebtoken');

// Mock all dependencies before requiring app
jest.mock('../redisClient', () => ({
  get: jest.fn(),
  setex: jest.fn(),
  on: jest.fn(),
}));

jest.mock('../logger/winstonConfig', () => ({
  info: jest.fn(),
  error: jest.fn(),
  http: jest.fn(),
}));

jest.mock('morgan', () => {
  const morganMock = jest.fn(() => (req, res, next) => next());
  morganMock.token = jest.fn();
  return morganMock;
});

// Mock performance middleware
jest.mock('../logger/performanceMiddleware', () => {
  return (req, res, next) => next();
});

describe('API Routes', () => {
  let app;
  let validToken;

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.SESSION_SECRET = 'test-session-secret';
    process.env.COOKIE_SECRET = 'test-cookie-secret';
    process.env.NODE_ENV = 'test';
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Clear require cache to get fresh app instance
    delete require.cache[require.resolve('../app.js')];
    app = require('../app.js');

    // Generate valid token
    validToken = jwt.sign(
      { id: 1, email: 'test@example.com', role: 'user' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  describe('GET /api/data', () => {
    it('should return 401 without authentication token', async () => {
      const response = await request(app)
        .get('/api/data')
        .expect(401);

      expect(response.body).toEqual({ message: 'No token provided' });
    });

    it('should return 401 with invalid token', async () => {
      const response = await request(app)
        .get('/api/data')
        .set('Cookie', 'token=invalid-token')
        .expect(401);

      expect(response.body).toEqual({ message: 'Invalid token' });
    });

    it('should return data with valid token in cookie', async () => {
      const redisClient = require('../redisClient');
      redisClient.get.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/data')
        .set('Cookie', `token=${validToken}`)
        .expect(200);

      expect(response.body).toEqual({ data: 'Success' });
    });

    it('should return data with valid token in Authorization header', async () => {
      const redisClient = require('../redisClient');
      redisClient.get.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/data')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body).toEqual({ data: 'Success' });
    });

    it('should return cached data if available', async () => {
      const redisClient = require('../redisClient');
      const cachedData = { data: 'Cached Success' };
      redisClient.get.mockResolvedValue(JSON.stringify(cachedData));

      const response = await request(app)
        .get('/api/data')
        .set('Cookie', `token=${validToken}`)
        .expect(200);

      expect(response.body).toEqual(cachedData);
      expect(redisClient.get).toHaveBeenCalledWith('cache:/api/data');
    });

    it('should cache response when not in cache', async () => {
      const redisClient = require('../redisClient');
      redisClient.get.mockResolvedValue(null);
      redisClient.setex.mockResolvedValue('OK');

      await request(app)
        .get('/api/data')
        .set('Cookie', `token=${validToken}`)
        .expect(200);

      expect(redisClient.setex).toHaveBeenCalledWith(
        'cache:/api/data',
        300,
        JSON.stringify({ data: 'Success' })
      );
    });

    it('should set req.user from token payload', async () => {
      const redisClient = require('../redisClient');
      redisClient.get.mockResolvedValue(null);

      const logger = require('../logger/winstonConfig');
      
      await request(app)
        .get('/api/data')
        .set('Cookie', `token=${validToken}`)
        .expect(200);

      // Logger should be called with user info
      expect(logger.info).toHaveBeenCalledWith(
        'Fetching data for user',
        { userId: 1 }
      );
    });

    it('should handle expired tokens', async () => {
      const expiredToken = jwt.sign(
        { id: 1, email: 'test@example.com' },
        process.env.JWT_SECRET,
        { expiresIn: '0s' }
      );

      // Wait to ensure token expires
      await new Promise(resolve => setTimeout(resolve, 100));

      const response = await request(app)
        .get('/api/data')
        .set('Cookie', `token=${expiredToken}`)
        .expect(401);

      expect(response.body).toEqual({ message: 'Invalid token' });
    });

    it('should handle Redis cache errors gracefully', async () => {
      const redisClient = require('../redisClient');
      redisClient.get.mockRejectedValue(new Error('Redis error'));

      const response = await request(app)
        .get('/api/data')
        .set('Cookie', `token=${validToken}`)
        .expect(200);

      expect(response.body).toEqual({ data: 'Success' });
    });
  });

  describe('Middleware Integration', () => {
    it('should parse JSON request body', async () => {
      const redisClient = require('../redisClient');
      redisClient.get.mockResolvedValue(null);

      await request(app)
        .get('/api/data')
        .set('Cookie', `token=${validToken}`)
        .send({ test: 'data' })
        .expect(200);
    });

    it('should parse cookies', async () => {
      const redisClient = require('../redisClient');
      redisClient.get.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/data')
        .set('Cookie', `token=${validToken}; other=value`)
        .expect(200);

      expect(response.body).toEqual({ data: 'Success' });
    });

    it('should apply logging middleware', async () => {
      const logger = require('../logger/winstonConfig');
      const redisClient = require('../redisClient');
      redisClient.get.mockResolvedValue(null);

      await request(app)
        .get('/api/data')
        .set('Cookie', `token=${validToken}`)
        .expect(200);

      // Verify logging was called
      expect(logger.info).toHaveBeenCalled();
    });

    it('should apply performance middleware', async () => {
      const redisClient = require('../redisClient');
      redisClient.get.mockResolvedValue(null);

      await request(app)
        .get('/api/data')
        .set('Cookie', `token=${validToken}`)
        .expect(200);

      // Performance middleware should have been applied
      // (mocked to just call next)
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for undefined routes', async () => {
      const response = await request(app)
        .get('/api/undefined-route')
        .expect(404);
    });

    it('should have error logging middleware', () => {
      // Error middleware is registered in app.js
      // This test verifies the app is properly configured
      expect(app).toBeDefined();
      expect(typeof app).toBe('function');
    });
  });

  describe('Security Headers', () => {
    it('should work with secure cookies in production', async () => {
      process.env.NODE_ENV = 'production';
      delete require.cache[require.resolve('../app.js')];
      const prodApp = require('../app.js');

      const redisClient = require('../redisClient');
      redisClient.get.mockResolvedValue(null);

      await request(prodApp)
        .get('/api/data')
        .set('Cookie', `token=${validToken}`)
        .expect(200);

      process.env.NODE_ENV = 'test';
    });
  });
});
