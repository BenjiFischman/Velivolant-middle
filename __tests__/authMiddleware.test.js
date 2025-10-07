const jwt = require('jsonwebtoken');
const authMiddleware = require('../authMiddleware');

describe('authMiddleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      cookies: {},
      headers: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
    process.env.JWT_SECRET = 'test-secret';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('verifyToken', () => {
    it('should return 401 if no token is provided', () => {
      authMiddleware.verifyToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: 'No token provided' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should verify token from cookies', () => {
      const payload = { id: 1, email: 'test@example.com' };
      const token = jwt.sign(payload, process.env.JWT_SECRET);
      req.cookies.token = token;

      authMiddleware.verifyToken(req, res, next);

      expect(req.user).toMatchObject(payload);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should verify token from Authorization header', () => {
      const payload = { id: 2, email: 'user@example.com' };
      const token = jwt.sign(payload, process.env.JWT_SECRET);
      req.headers['authorization'] = `Bearer ${token}`;

      authMiddleware.verifyToken(req, res, next);

      expect(req.user).toMatchObject(payload);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 401 for invalid token', () => {
      req.cookies.token = 'invalid-token';

      authMiddleware.verifyToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: 'Invalid token' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 for expired token', (done) => {
      const token = jwt.sign({ id: 1 }, process.env.JWT_SECRET, { expiresIn: '-1s' });
      req.cookies.token = token;

      authMiddleware.verifyToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: 'Invalid token' });
      expect(next).not.toHaveBeenCalled();
      done();
    });

    it('should prefer cookie token over header token', () => {
      const cookiePayload = { id: 1, source: 'cookie' };
      const headerPayload = { id: 2, source: 'header' };
      
      const cookieToken = jwt.sign(cookiePayload, process.env.JWT_SECRET);
      const headerToken = jwt.sign(headerPayload, process.env.JWT_SECRET);
      
      req.cookies.token = cookieToken;
      req.headers['authorization'] = `Bearer ${headerToken}`;

      authMiddleware.verifyToken(req, res, next);

      expect(req.user.source).toBe('cookie');
      expect(next).toHaveBeenCalled();
    });
  });

  describe('checkRole', () => {
    it('should return 401 if user is not authenticated', () => {
      const middleware = authMiddleware.checkRole(['admin']);
      
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: 'Unauthorized' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 if user does not have required role', () => {
      req.user = { id: 1, role: 'user' };
      const middleware = authMiddleware.checkRole(['admin']);

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: 'Forbidden' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next if user has required role', () => {
      req.user = { id: 1, role: 'admin' };
      const middleware = authMiddleware.checkRole(['admin']);

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should allow multiple roles', () => {
      req.user = { id: 1, role: 'moderator' };
      const middleware = authMiddleware.checkRole(['admin', 'moderator']);

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should handle empty roles array', () => {
      req.user = { id: 1, role: 'user' };
      const middleware = authMiddleware.checkRole([]);

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: 'Forbidden' });
    });

    it('should be case-sensitive for role checking', () => {
      req.user = { id: 1, role: 'Admin' };
      const middleware = authMiddleware.checkRole(['admin']);

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
