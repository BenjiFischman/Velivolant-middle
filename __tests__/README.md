# Test Suite Documentation

This directory contains comprehensive tests for the middleware package, covering authentication, sessions, cookies, caching, and API routes.

## Test Coverage

**Overall Coverage: 70.58%**
- **Authentication Middleware**: 100%
- **Cache Middleware**: 100%
- **Cookie Middleware**: 100%
- **Session Middleware**: 100%
- **App/API Routes**: 84.21%

## Test Files

### 1. `authMiddleware.test.js`
Tests for JWT authentication and role-based authorization.

**Coverage:**
- ✅ Token verification from cookies
- ✅ Token verification from Authorization header
- ✅ Token preference (cookies over headers)
- ✅ Invalid token handling
- ✅ Expired token handling
- ✅ Missing token scenarios
- ✅ Role-based access control
- ✅ Multiple roles support
- ✅ Case-sensitive role checking

**Test Count:** 12 tests

### 2. `cacheMiddleware.test.js`
Tests for Redis-based caching functionality.

**Coverage:**
- ✅ Cache hit scenarios
- ✅ Cache miss scenarios
- ✅ Custom cache duration
- ✅ Cache key generation
- ✅ Response caching
- ✅ Cache clearing (single pattern)
- ✅ Cache clearing (multiple patterns)
- ✅ Empty key handling
- ✅ Redis error handling
- ✅ Large-scale cache operations
- ✅ Complex object caching

**Test Count:** 13 tests

### 3. `sessionMiddleware.test.js`
Tests for Express session configuration.

**Coverage:**
- ✅ Middleware export validation
- ✅ Session secret configuration
- ✅ Secure cookies in production
- ✅ HttpOnly cookie flag
- ✅ Cookie maxAge (24 hours)
- ✅ SameSite strict policy
- ✅ Session resave behavior
- ✅ Uninitialized session handling
- ✅ Missing secret handling
- ✅ Environment variable configuration

**Test Count:** 10 tests

### 4. `cookieMiddleware.test.js`
Tests for cookie parsing functionality.

**Coverage:**
- ✅ Middleware export validation
- ✅ Cookie secret initialization
- ✅ Undefined secret handling
- ✅ Express middleware signature
- ✅ Cookie-parser integration
- ✅ Signed cookie support
- ✅ Environment configuration
- ✅ Express app integration
- ✅ Import consistency

**Test Count:** 10 tests

### 5. `app.test.js`
Integration tests for API routes and middleware stack.

**Coverage:**
- ✅ Authentication required endpoints
- ✅ Invalid token rejection
- ✅ Valid token acceptance (cookie)
- ✅ Valid token acceptance (Authorization header)
- ✅ Cached response handling
- ✅ Response caching behavior
- ✅ User context in requests
- ✅ Expired token handling
- ✅ Redis error graceful degradation
- ✅ JSON body parsing
- ✅ Cookie parsing integration
- ✅ Logging middleware
- ✅ Performance middleware
- ✅ 404 error handling
- ✅ Error logging middleware
- ✅ Production environment configuration

**Test Count:** 16 tests

## Running Tests

### Run all tests
```bash
npm test
```

### Run tests with coverage
```bash
npm run test:coverage
```

### Run tests in watch mode
```bash
npm run test:watch
```

### Run specific test file
```bash
npx jest __tests__/authMiddleware.test.js
```

## Test Configuration

The test suite uses:
- **Test Framework**: Jest
- **HTTP Testing**: Supertest
- **Environment**: Node.js test environment
- **Setup File**: `__tests__/setup.js`

### Jest Configuration (`jest.config.js`)
```javascript
{
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  setupFilesAfterEnv: ['./__tests__/setup.js'],
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true
}
```

## Environment Variables for Testing

Tests use the following environment variables (set in `__tests__/setup.js`):
- `NODE_ENV=test`
- `JWT_SECRET=test-jwt-secret`
- `SESSION_SECRET=test-session-secret`
- `COOKIE_SECRET=test-cookie-secret`
- `REDIS_HOST=localhost`
- `REDIS_PORT=6379`

## Mocking Strategy

### Redis Client
Redis is fully mocked to avoid requiring a running Redis instance for tests:
```javascript
jest.mock('../redisClient', () => ({
  get: jest.fn(),
  setex: jest.fn(),
  keys: jest.fn(),
  del: jest.fn(),
}));
```

### Logger
Winston logger is mocked to prevent log output during tests:
```javascript
jest.mock('../logger/winstonConfig', () => ({
  info: jest.fn(),
  error: jest.fn(),
  http: jest.fn(),
}));
```

### Morgan
Morgan HTTP logger is mocked with token support:
```javascript
jest.mock('morgan', () => {
  const morganMock = jest.fn(() => (req, res, next) => next());
  morganMock.token = jest.fn();
  return morganMock;
});
```

## Test Patterns

### Unit Tests
Tests individual middleware functions in isolation:
- `authMiddleware.test.js`
- `cacheMiddleware.test.js`

### Configuration Tests
Tests middleware configuration and setup:
- `sessionMiddleware.test.js`
- `cookieMiddleware.test.js`

### Integration Tests
Tests the full application stack:
- `app.test.js`

## Adding New Tests

When adding new tests:

1. Create a new test file in `__tests__/` with `.test.js` extension
2. Import the module to test
3. Mock external dependencies
4. Write descriptive test cases with `describe` and `it` blocks
5. Use appropriate Jest matchers
6. Ensure tests are isolated (no shared state)

### Example Test Structure
```javascript
describe('MyMiddleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = { /* mock request */ };
    res = { /* mock response */ };
    next = jest.fn();
  });

  it('should do something', () => {
    myMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
```

## Continuous Integration

Tests can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions
- name: Run tests
  run: npm test

- name: Generate coverage
  run: npm run test:coverage

- name: Upload coverage to Codecov
  uses: codecov/codecov-action@v3
```

## Coverage Goals

Target coverage goals:
- **Statements**: 80%+
- **Branches**: 75%+
- **Functions**: 80%+
- **Lines**: 80%+

Current coverage exceeds these goals for all middleware modules!

## Common Test Scenarios

### Testing Authentication
```javascript
// Generate valid token
const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

// Test with cookie
.set('Cookie', `token=${token}`)

// Test with header
.set('Authorization', `Bearer ${token}`)
```

### Testing Cache
```javascript
// Mock cache hit
redisClient.get.mockResolvedValue(JSON.stringify(data));

// Mock cache miss
redisClient.get.mockResolvedValue(null);

// Mock cache error
redisClient.get.mockRejectedValue(new Error('Redis error'));
```

### Testing API Routes
```javascript
const response = await request(app)
  .get('/api/data')
  .set('Cookie', `token=${validToken}`)
  .expect(200);

expect(response.body).toEqual({ data: 'Success' });
```

## Troubleshooting

### Tests Fail with "Cannot find module"
- Ensure all dependencies are installed: `npm install`
- Check that file paths in tests are correct

### Redis Connection Errors
- Ensure Redis client is properly mocked in tests
- Redis should never be required during tests

### Session/Cookie Warnings
- Warnings about MemoryStore are expected in test environment
- They can be ignored or suppressed if needed

## Best Practices

1. **Test Isolation**: Each test should be independent
2. **Mock External Services**: Never rely on external services in tests
3. **Clear Test Names**: Use descriptive names that explain what is being tested
4. **Arrange-Act-Assert**: Structure tests clearly
5. **Edge Cases**: Test both success and failure scenarios
6. **Clean Up**: Use `beforeEach` and `afterEach` for setup/teardown

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [Jest Matchers](https://jestjs.io/docs/expect)
- [Mocking with Jest](https://jestjs.io/docs/mock-functions)
