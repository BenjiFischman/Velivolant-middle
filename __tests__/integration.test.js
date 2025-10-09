const request = require('supertest');
const bcrypt = require('bcrypt');

// Mock external dependencies
jest.mock('../logger/winstonConfig', () => ({
  info: jest.fn(),
  error: jest.fn(),
  http: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../redisClient', () => ({
  get: jest.fn(),
  setex: jest.fn(),
  on: jest.fn(),
}));

jest.mock('morgan', () => {
  const morganMock = jest.fn(() => (req, res, next) => next());
  morganMock.token = jest.fn();
  return morganMock;
});

jest.mock('../logger/performanceMiddleware', () => {
  return (req, res, next) => next();
});

// Mock database
jest.mock('../db/postgres', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
  close: jest.fn(),
  pool: { totalCount: 0 }
}));

const db = require('../db/postgres');

describe('Authentication Integration Tests', () => {
  let app;
  let testUser = null;

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-integration';
    process.env.NODE_ENV = 'test';
  });

  beforeEach(() => {
    jest.clearAllMocks();
    delete require.cache[require.resolve('../app.js')];
    app = require('../app.js');
  });

  afterEach(async () => {
    // Cleanup test user if created
    if (testUser && testUser.id) {
      try {
        await db.query('DELETE FROM users WHERE id = $1', [testUser.id]);
      } catch (error) {
        // Ignore cleanup errors
      }
      testUser = null;
    }
  });

  describe('Full Registration Flow', () => {
    it('should complete full registration with mock database', async () => {
      const mockUserId = Math.floor(Math.random() * 100000);
      const mockAccountId = Math.floor(Math.random() * 100000);
      const timestamp = Date.now();
      
      // Mock successful registration
      db.query = jest.fn()
        .mockResolvedValueOnce({ rows: [] }); // No existing user

      db.transaction = jest.fn(async (callback) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({ // Insert user
              rows: [{
                id: mockUserId,
                username: 'integrationtest',
                email: `integration_${timestamp}@test.com`,
                display_name: 'integrationtest',
                created_at: new Date(),
              }]
            })
            .mockResolvedValueOnce({ // Insert account
              rows: [{
                account_id: mockAccountId,
                first_name: 'Integration',
                last_name: 'Test',
                email_verified: false,
              }]
            })
            .mockResolvedValueOnce({ // Insert verification token
              rows: [{ id: 1 }]
            })
        };
        return callback(mockClient);
      });

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'integrationtest',
          email: `integration_${timestamp}@test.com`,
          password: 'Integration123!',
          confirmPassword: 'Integration123!',
          firstName: 'Integration',
          lastName: 'Test',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.username).toBe('integrationtest');
      expect(response.body.data.token).toBeDefined();
      
      // Verify JWT token structure
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(response.body.data.token, process.env.JWT_SECRET);
      expect(decoded.id).toBe(mockUserId);
      expect(decoded.email).toContain('integration');
    });
  });

  describe('Full Login-Logout Flow', () => {
    it('should login and then logout successfully', async () => {
      const mockUser = {
        id: 1,
        username: 'loginuser',
        email: 'login@test.com',
        password_hash: await bcrypt.hash('Login123!', 10),
        is_active: true,
        account_id: 1,
        first_name: 'Login',
        last_name: 'User',
        email_verified: true,
      };

      db.query = jest.fn()
        .mockResolvedValueOnce({ rows: [mockUser] }) // Find user
        .mockResolvedValueOnce({ rows: [] }); // Update last_login

      // Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          emailOrUsername: 'login@test.com',
          password: 'Login123!',
        })
        .expect(200);

      expect(loginResponse.body.success).toBe(true);
      const cookies = loginResponse.headers['set-cookie'];
      expect(cookies).toBeDefined();

      // Logout
      const logoutResponse = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', cookies)
        .expect(200);

      expect(logoutResponse.body.success).toBe(true);
      
      // Verify token is cleared
      const clearCookie = logoutResponse.headers['set-cookie'];
      expect(clearCookie[0]).toContain('token=;');
    });
  });

  describe('Full Password Reset Flow', () => {
    it('should complete password reset from request to confirmation', async () => {
      const resetToken = 'test-reset-token-123';
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      // Step 1: Request reset
      db.query = jest.fn()
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Find user
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // Insert token

      const requestResponse = await request(app)
        .post('/api/auth/password/reset-request')
        .send({
          email: 'reset@test.com',
        })
        .expect(200);

      expect(requestResponse.body.success).toBe(true);

      // Step 2: Verify token
      db.query = jest.fn().mockResolvedValueOnce({
        rows: [{
          user_id: 1,
          expires_at: expiresAt,
          used: false,
        }]
      });

      const verifyResponse = await request(app)
        .post('/api/auth/password/reset-verify')
        .send({
          token: resetToken,
        })
        .expect(200);

      expect(verifyResponse.body.success).toBe(true);

      // Step 3: Confirm reset
      db.query = jest.fn().mockResolvedValueOnce({
        rows: [{
          user_id: 1,
          expires_at: expiresAt,
          used: false,
        }]
      });

      db.transaction = jest.fn(async (callback) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({ rows: [] }) // Update password
            .mockResolvedValueOnce({ rows: [] })  // Mark token used
        };
        return callback(mockClient);
      });

      const confirmResponse = await request(app)
        .post('/api/auth/password/reset-confirm')
        .send({
          token: resetToken,
          newPassword: 'NewResetPassword123!',
        })
        .expect(200);

      expect(confirmResponse.body.success).toBe(true);
      expect(confirmResponse.body.message).toContain('reset successfully');
    });
  });

  describe('Protected Routes Flow', () => {
    it('should access protected route with valid token', async () => {
      const jwt = require('jsonwebtoken');
      const token = jwt.sign(
        { id: 1, email: 'protected@test.com', role: 'user' },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );

      db.query = jest.fn().mockResolvedValueOnce({
        rows: [{
          id: 1,
          username: 'protecteduser',
          email: 'protected@test.com',
          is_active: true,
          created_at: new Date(),
          account_id: 1,
          first_name: 'Protected',
          last_name: 'User',
          email_verified: true,
          balance: '50.00',
          last_login: new Date(),
        }]
      });

      const response = await request(app)
        .get('/api/auth/me')
        .set('Cookie', `token=${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.email).toBe('protected@test.com');
    });

    it('should reject access without token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .expect(401);

      expect(response.body.message).toContain('No token');
    });
  });

  describe('Email Verification Flow', () => {
    it('should verify email and resend if needed', async () => {
      const jwt = require('jsonwebtoken');
      const token = jwt.sign(
        { id: 1, email: 'verify@test.com' },
        process.env.JWT_SECRET
      );

      // Resend verification
      db.query = jest.fn()
        .mockResolvedValueOnce({ // Check if verified
          rows: [{ email_verified: false }]
        });

      db.transaction = jest.fn(async (callback) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({ rows: [] }) // Invalidate old tokens
            .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Insert new token
        };
        return callback(mockClient);
      });

      const resendResponse = await request(app)
        .post('/api/auth/email/resend')
        .set('Cookie', `token=${token}`)
        .expect(200);

      expect(resendResponse.body.success).toBe(true);
      expect(resendResponse.body.verificationToken).toBeDefined();
    });

    it('should reject resend if already verified', async () => {
      const jwt = require('jsonwebtoken');
      const token = jwt.sign(
        { id: 1, email: 'verified@test.com' },
        process.env.JWT_SECRET
      );

      db.query = jest.fn().mockResolvedValueOnce({
        rows: [{ email_verified: true }]
      });

      const response = await request(app)
        .post('/api/auth/email/resend')
        .set('Cookie', `token=${token}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('already verified');
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      db.query = jest.fn().mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          emailOrUsername: 'test@example.com',
          password: 'Test123!',
        })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('failed');
    });

    it('should handle transaction errors gracefully', async () => {
      db.query = jest.fn().mockResolvedValueOnce({ rows: [] });
      db.transaction = jest.fn().mockRejectedValue(new Error('Transaction failed'));

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'testuser',
          email: 'test@example.com',
          password: 'Test123!',
          confirmPassword: 'Test123!',
        })
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });
});
