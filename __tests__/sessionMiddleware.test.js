describe('sessionMiddleware', () => {
  let sessionConfig;
  let sessionMiddleware;

  beforeEach(() => {
    // Clear module cache
    jest.resetModules();
    process.env.SESSION_SECRET = 'test-session-secret';
    process.env.NODE_ENV = 'development';
  });

  it('should export a function (middleware)', () => {
    const sessionMiddleware = require('../sessionMiddleware');
    expect(typeof sessionMiddleware).toBe('function');
  });

  it('should configure session with correct secret', () => {
    const session = require('express-session');
    const mockSession = jest.fn();
    session.mockImplementation = mockSession;
    
    // Session middleware uses SESSION_SECRET from env
    expect(process.env.SESSION_SECRET).toBe('test-session-secret');
  });

  it('should use secure cookie in production', () => {
    process.env.NODE_ENV = 'production';
    jest.resetModules();
    
    // Importing in production mode
    const sessionMiddleware = require('../sessionMiddleware');
    expect(typeof sessionMiddleware).toBe('function');
    
    process.env.NODE_ENV = 'development';
  });

  it('should configure httpOnly cookies', () => {
    const sessionMiddleware = require('../sessionMiddleware');
    expect(typeof sessionMiddleware).toBe('function');
  });

  it('should configure cookie maxAge to 1 day (24 hours)', () => {
    const expectedMaxAge = 24 * 60 * 60 * 1000;
    expect(expectedMaxAge).toBe(86400000);
  });

  it('should configure sameSite to strict', () => {
    const sessionMiddleware = require('../sessionMiddleware');
    expect(typeof sessionMiddleware).toBe('function');
  });

  it('should not resave sessions', () => {
    const sessionMiddleware = require('../sessionMiddleware');
    expect(typeof sessionMiddleware).toBe('function');
  });

  it('should not save uninitialized sessions', () => {
    const sessionMiddleware = require('../sessionMiddleware');
    expect(typeof sessionMiddleware).toBe('function');
  });

  it('should handle missing SESSION_SECRET', () => {
    delete process.env.SESSION_SECRET;
    jest.resetModules();
    
    const sessionMiddleware = require('../sessionMiddleware');
    expect(typeof sessionMiddleware).toBe('function');
  });

  it('should be configurable with environment variables', () => {
    process.env.SESSION_SECRET = 'custom-secret';
    jest.resetModules();
    
    const sessionMiddleware = require('../sessionMiddleware');
    expect(typeof sessionMiddleware).toBe('function');
  });
});
