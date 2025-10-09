const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

// Mock all external dependencies
jest.mock('../db/postgres', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
  close: jest.fn(),
  pool: { totalCount: 0 }
}));

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

const db = require('../db/postgres');

describe('Authentication API', () => {
  let app;

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.NODE_ENV = 'test';
  });

  beforeEach(() => {
    jest.clearAllMocks();
    delete require.cache[require.resolve('../app.js')];
    app = require('../app.js');
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully', async () => {
      const mockUser = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        created_at: new Date(),
      };

      const mockAccount = {
        account_id: 1,
        first_name: 'Test',
        last_name: 'User',
        email_verified: false,
      };

      // Mock database queries
      db.query
        .mockResolvedValueOnce({ rows: [] }) // Check existing user
        .mockResolvedValueOnce({ rows: [mockUser] }) // Insert user
        .mockResolvedValueOnce({ rows: [mockAccount] }) // Insert account
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // Insert verification token

      db.transaction = jest.fn(async (callback) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({ rows: [mockUser] })
            .mockResolvedValueOnce({ rows: [mockAccount] })
            .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        };
        return callback(mockClient);
      });

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'testuser',
          email: 'test@example.com',
          password: 'Test123!',
          confirmPassword: 'Test123!',
          firstName: 'Test',
          lastName: 'User',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.username).toBe('testuser');
      expect(response.body.data.user.email).toBe('test@example.com');
      expect(response.body.data.token).toBeDefined();
      expect(response.headers['set-cookie']).toBeDefined();
    });

    it('should reject registration with duplicate email', async () => {
      db.query.mockResolvedValueOnce({ 
        rows: [{ id: 1, email: 'test@example.com' }] 
      });

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'newuser',
          email: 'test@example.com',
          password: 'Test123!',
          confirmPassword: 'Test123!',
        })
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Email already registered');
    });

    it('should reject registration with duplicate username', async () => {
      db.query.mockResolvedValueOnce({ 
        rows: [{ id: 1, username: 'testuser' }] 
      });

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'testuser',
          email: 'new@example.com',
          password: 'Test123!',
          confirmPassword: 'Test123!',
        })
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Username already taken');
    });

    it('should validate password strength', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'testuser',
          email: 'test@example.com',
          password: 'weak',
          confirmPassword: 'weak',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should validate password confirmation match', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'testuser',
          email: 'test@example.com',
          password: 'Test123!',
          confirmPassword: 'Different123!',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials (email)', async () => {
      const mockUser = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        password_hash: await bcrypt.hash('Test123!', 10),
        is_active: true,
        account_id: 1,
        first_name: 'Test',
        last_name: 'User',
        email_verified: true,
      };

      db.query
        .mockResolvedValueOnce({ rows: [mockUser] }) // Find user
        .mockResolvedValueOnce({ rows: [] }); // Update last_login

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          emailOrUsername: 'test@example.com',
          password: 'Test123!',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe('test@example.com');
      expect(response.body.data.token).toBeDefined();
    });

    it('should login with valid credentials (username)', async () => {
      const mockUser = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        password_hash: await bcrypt.hash('Test123!', 10),
        is_active: true,
        account_id: 1,
        first_name: 'Test',
        last_name: 'User',
        email_verified: true,
      };

      db.query
        .mockResolvedValueOnce({ rows: [mockUser] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          emailOrUsername: 'testuser',
          password: 'Test123!',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.username).toBe('testuser');
    });

    it('should reject login with invalid email', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          emailOrUsername: 'nonexistent@example.com',
          password: 'Test123!',
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid credentials');
    });

    it('should reject login with wrong password', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        password_hash: await bcrypt.hash('Test123!', 10),
        is_active: true,
      };

      db.query.mockResolvedValueOnce({ rows: [mockUser] });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          emailOrUsername: 'test@example.com',
          password: 'WrongPassword!',
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid credentials');
    });

    it('should reject login for inactive account', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        password_hash: await bcrypt.hash('Test123!', 10),
        is_active: false,
      };

      db.query.mockResolvedValueOnce({ rows: [mockUser] });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          emailOrUsername: 'test@example.com',
          password: 'Test123!',
        })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('deactivated');
    });

    it('should set httpOnly cookie on successful login', async () => {
      const mockUser = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        password_hash: await bcrypt.hash('Test123!', 10),
        is_active: true,
        account_id: 1,
        first_name: 'Test',
        last_name: 'User',
        email_verified: true,
      };

      db.query
        .mockResolvedValueOnce({ rows: [mockUser] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          emailOrUsername: 'test@example.com',
          password: 'Test123!',
        })
        .expect(200);

      const setCookie = response.headers['set-cookie'];
      expect(setCookie).toBeDefined();
      expect(setCookie[0]).toContain('token=');
      expect(setCookie[0]).toContain('HttpOnly');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout and clear cookie', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Logged out');
      
      const setCookie = response.headers['set-cookie'];
      expect(setCookie).toBeDefined();
      expect(setCookie[0]).toContain('token=;');
    });
  });

  describe('POST /api/auth/password/reset-request', () => {
    it('should accept password reset request', async () => {
      db.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // Find user
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // Insert token

      const response = await request(app)
        .post('/api/auth/password/reset-request')
        .send({
          email: 'test@example.com',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('reset link');
    });

    it('should not reveal if email does not exist', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/auth/password/reset-request')
        .send({
          email: 'nonexistent@example.com',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('If the email exists');
    });

    it('should require email field', async () => {
      const response = await request(app)
        .post('/api/auth/password/reset-request')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/password/reset-verify', () => {
    it('should verify valid reset token', async () => {
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      
      db.query.mockResolvedValueOnce({
        rows: [{
          user_id: 1,
          expires_at: expiresAt,
          used: false,
        }]
      });

      const response = await request(app)
        .post('/api/auth/password/reset-verify')
        .send({
          token: 'valid-token-123',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('valid');
    });

    it('should reject invalid reset token', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/auth/password/reset-verify')
        .send({
          token: 'invalid-token',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid');
    });

    it('should reject expired reset token', async () => {
      const expiresAt = new Date(Date.now() - 1000); // Expired
      
      db.query.mockResolvedValueOnce({
        rows: [{
          user_id: 1,
          expires_at: expiresAt,
          used: false,
        }]
      });

      const response = await request(app)
        .post('/api/auth/password/reset-verify')
        .send({
          token: 'expired-token',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('expired');
    });

    it('should reject already used token', async () => {
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      
      db.query.mockResolvedValueOnce({
        rows: [{
          user_id: 1,
          expires_at: expiresAt,
          used: true,
        }]
      });

      const response = await request(app)
        .post('/api/auth/password/reset-verify')
        .send({
          token: 'used-token',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/password/reset-confirm', () => {
    it('should reset password with valid token', async () => {
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      
      db.query.mockResolvedValueOnce({
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

      const response = await request(app)
        .post('/api/auth/password/reset-confirm')
        .send({
          token: 'valid-reset-token',
          newPassword: 'NewPassword123!',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('reset successfully');
    });

    it('should validate new password strength', async () => {
      const response = await request(app)
        .post('/api/auth/password/reset-confirm')
        .send({
          token: 'valid-token',
          newPassword: 'weak',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('8 characters');
    });

    it('should require both token and password', async () => {
      const response = await request(app)
        .post('/api/auth/password/reset-confirm')
        .send({
          token: 'token-only',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject expired token during reset', async () => {
      const expiresAt = new Date(Date.now() - 1000);
      
      db.query.mockResolvedValueOnce({
        rows: [{
          user_id: 1,
          expires_at: expiresAt,
          used: false,
        }]
      });

      const response = await request(app)
        .post('/api/auth/password/reset-confirm')
        .send({
          token: 'expired-token',
          newPassword: 'NewPassword123!',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return current user with valid token', async () => {
      const token = jwt.sign(
        { id: 1, email: 'test@example.com', role: 'user' },
        process.env.JWT_SECRET
      );

      const mockUser = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        is_active: true,
        created_at: new Date(),
        account_id: 1,
        first_name: 'Test',
        last_name: 'User',
        email_verified: true,
        balance: '100.00',
        last_login: new Date(),
      };

      db.query.mockResolvedValueOnce({ rows: [mockUser] });

      const response = await request(app)
        .get('/api/auth/me')
        .set('Cookie', `token=${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(1);
      expect(response.body.data.email).toBe('test@example.com');
      expect(response.body.data.balance).toBe(100.00);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .expect(401);

      expect(response.body.message).toContain('No token');
    });

    it('should reject invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Cookie', 'token=invalid-token')
        .expect(401);

      expect(response.body.message).toContain('Invalid token');
    });
  });

  describe('POST /api/auth/password/change', () => {
    it('should change password with valid current password', async () => {
      const token = jwt.sign(
        { id: 1, email: 'test@example.com' },
        process.env.JWT_SECRET
      );

      const mockUser = {
        password_hash: await bcrypt.hash('OldPassword123!', 10),
      };

      db.query
        .mockResolvedValueOnce({ rows: [mockUser] }) // Get current hash
        .mockResolvedValueOnce({ rows: [] }); // Update password

      const response = await request(app)
        .post('/api/auth/password/change')
        .set('Cookie', `token=${token}`)
        .send({
          currentPassword: 'OldPassword123!',
          newPassword: 'NewPassword123!',
          confirmPassword: 'NewPassword123!',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('changed successfully');
    });

    it('should reject wrong current password', async () => {
      const token = jwt.sign(
        { id: 1, email: 'test@example.com' },
        process.env.JWT_SECRET
      );

      const mockUser = {
        password_hash: await bcrypt.hash('OldPassword123!', 10),
      };

      db.query.mockResolvedValueOnce({ rows: [mockUser] });

      const response = await request(app)
        .post('/api/auth/password/change')
        .set('Cookie', `token=${token}`)
        .send({
          currentPassword: 'WrongPassword!',
          newPassword: 'NewPassword123!',
          confirmPassword: 'NewPassword123!',
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('incorrect');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/auth/password/change')
        .send({
          currentPassword: 'Old123!',
          newPassword: 'New123!',
          confirmPassword: 'New123!',
        })
        .expect(401);

      expect(response.body.message).toContain('No token');
    });
  });

  describe('POST /api/auth/email/verify', () => {
    it('should verify email with valid token', async () => {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      
      db.query.mockResolvedValueOnce({
        rows: [{
          user_id: 1,
          expires_at: expiresAt,
          used: false,
        }]
      });

      db.transaction = jest.fn(async (callback) => {
        const mockClient = {
          query: jest.fn()
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] })
        };
        return callback(mockClient);
      });

      const response = await request(app)
        .post('/api/auth/email/verify')
        .send({
          token: 'valid-email-token',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('verified');
    });

    it('should reject invalid email verification token', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/auth/email/verify')
        .send({
          token: 'invalid-token',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject expired email verification token', async () => {
      const expiresAt = new Date(Date.now() - 1000);
      
      db.query.mockResolvedValueOnce({
        rows: [{
          user_id: 1,
          expires_at: expiresAt,
          used: false,
        }]
      });

      const response = await request(app)
        .post('/api/auth/email/verify')
        .send({
          token: 'expired-token',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('expired');
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should refresh token for valid user', async () => {
      const token = jwt.sign(
        { id: 1, email: 'test@example.com' },
        process.env.JWT_SECRET
      );

      db.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          email: 'test@example.com',
          is_active: true,
        }]
      });

      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `token=${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.token).toBeDefined();
      
      // Verify new token is valid
      const decoded = jwt.verify(
        response.body.data.token,
        process.env.JWT_SECRET
      );
      expect(decoded.id).toBe(1);
    });

    it('should reject refresh for inactive user', async () => {
      const token = jwt.sign(
        { id: 1, email: 'test@example.com' },
        process.env.JWT_SECRET
      );

      db.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          email: 'test@example.com',
          is_active: false,
        }]
      });

      const response = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `token=${token}`)
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Security', () => {
    it('should hash passwords with bcrypt', async () => {
      const password = 'TestPassword123!';
      const hash = await bcrypt.hash(password, 10);
      
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(50);
      expect(await bcrypt.compare(password, hash)).toBe(true);
    });

    it('should generate unique tokens', () => {
      const crypto = require('crypto');
      const token1 = crypto.randomBytes(32).toString('hex');
      const token2 = crypto.randomBytes(32).toString('hex');
      
      expect(token1).not.toBe(token2);
      expect(token1.length).toBe(64);
      expect(token2.length).toBe(64);
    });

    it('should set secure cookie attributes', async () => {
      const mockUser = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        password_hash: await bcrypt.hash('Test123!', 10),
        is_active: true,
        account_id: 1,
        first_name: 'Test',
        last_name: 'User',
        email_verified: true,
      };

      db.query
        .mockResolvedValueOnce({ rows: [mockUser] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          emailOrUsername: 'test@example.com',
          password: 'Test123!',
        });

      const setCookie = response.headers['set-cookie'][0];
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('SameSite=Strict');
    });
  });
});
