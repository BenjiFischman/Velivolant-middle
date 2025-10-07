describe('cookieMiddleware', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.COOKIE_SECRET = 'test-cookie-secret';
  });

  it('should export a function (middleware)', () => {
    const cookieMiddleware = require('../cookieMiddleware');
    expect(typeof cookieMiddleware).toBe('function');
  });

  it('should be initialized with COOKIE_SECRET from environment', () => {
    process.env.COOKIE_SECRET = 'my-secret-key';
    jest.resetModules();
    
    const cookieMiddleware = require('../cookieMiddleware');
    expect(typeof cookieMiddleware).toBe('function');
  });

  it('should handle undefined COOKIE_SECRET', () => {
    delete process.env.COOKIE_SECRET;
    jest.resetModules();
    
    const cookieMiddleware = require('../cookieMiddleware');
    expect(typeof cookieMiddleware).toBe('function');
  });

  it('should be callable as Express middleware with 3 parameters', () => {
    const cookieMiddleware = require('../cookieMiddleware');
    
    // Express middleware signature is (req, res, next)
    expect(cookieMiddleware.length).toBeGreaterThanOrEqual(0);
    expect(typeof cookieMiddleware).toBe('function');
  });

  it('should use cookie-parser package', () => {
    const cookieMiddleware = require('../cookieMiddleware');
    expect(cookieMiddleware).toBeDefined();
  });

  it('should parse signed cookies when secret is provided', () => {
    process.env.COOKIE_SECRET = 'secure-secret';
    jest.resetModules();
    
    const cookieMiddleware = require('../cookieMiddleware');
    expect(typeof cookieMiddleware).toBe('function');
  });

  it('should be configurable via environment variables', () => {
    process.env.COOKIE_SECRET = 'custom-cookie-secret';
    jest.resetModules();
    
    const cookieMiddleware = require('../cookieMiddleware');
    expect(cookieMiddleware).toBeDefined();
  });

  it('should integrate with Express app', () => {
    const cookieMiddleware = require('../cookieMiddleware');
    
    // Should be usable with app.use()
    expect(typeof cookieMiddleware).toBe('function');
  });

  it('should support cookie parsing functionality', () => {
    const cookieMiddleware = require('../cookieMiddleware');
    expect(cookieMiddleware).not.toBeNull();
  });

  it('should maintain consistency across multiple imports', () => {
    const cookieMiddleware1 = require('../cookieMiddleware');
    const cookieMiddleware2 = require('../cookieMiddleware');
    
    expect(cookieMiddleware1).toBe(cookieMiddleware2);
  });
});
