# Test Guide - Running Tests

## Test Types

### Unit Tests (No Database Required) ✅
These tests use mocks and run without external dependencies:
- `authMiddleware.test.js` - 12 tests
- `cacheMiddleware.test.js` - 13 tests
- `cookieMiddleware.test.js` - 10 tests
- `sessionMiddleware.test.js` - 10 tests
- `auth.test.js` - 38 tests (mocked database)
- `integration.test.js` - 15 tests (mocked database)

**Total**: 98 tests (no database needed)

### Integration Tests (Database Required) 🗄️
These tests require a live PostgreSQL connection:
- `database.test.js` - 32 tests

**Total**: 32 tests (need PostgreSQL)

---

## Running Tests

### Run All Tests (Requires PostgreSQL)
```bash
npm test
```

### Run Only Unit Tests (No Database)
```bash
npx jest --testPathIgnorePatterns=database.test.js
```

### Run Only Database Tests
```bash
npx jest database.test.js
```

### Run Specific Test File
```bash
npx jest auth.test.js
npx jest authMiddleware.test.js
```

### Run with Coverage
```bash
npm run test:coverage
```

---

## Database Setup for Tests

### Quick Setup

```bash
# Create test database
createdb libation_test -U libation

# Run migrations
POSTGRES_DB=libation_test npm run db:migrate

# Run tests
npm test
```

### Using Docker

```bash
# Start PostgreSQL
docker run -d --name postgres-test \
  -e POSTGRES_DB=libation_test \
  -e POSTGRES_USER=libation \
  -e POSTGRES_PASSWORD=changeme \
  -p 5432:5432 \
  postgres:16-alpine

# Wait for it to be ready
sleep 5

# Run migrations
POSTGRES_DB=libation_test npm run db:migrate

# Run tests
npm test
```

### Environment Variables for Tests

Tests use these PostgreSQL settings (from `__tests__/setup.js`):

```env
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=libation_test  # Uses test database
POSTGRES_USER=libation
POSTGRES_PASSWORD=changeme
```

You can override with:
```bash
TEST_POSTGRES_HOST=localhost \
TEST_POSTGRES_DB=my_test_db \
npm test
```

---

## Test Results

### Current Status

```
✓ authMiddleware.test.js    - 12/12 passing ✅
✓ cacheMiddleware.test.js   - 13/13 passing ✅
✓ cookieMiddleware.test.js  - 10/10 passing ✅
✓ sessionMiddleware.test.js - 10/10 passing ✅
✓ auth.test.js              - 38/38 passing ✅
✓ integration.test.js       - 15/15 passing ✅
⚠ database.test.js          - 32/32 (requires PostgreSQL)

Total: 130 tests
```

---

## Troubleshooting

### "Cannot connect to database"

**Problem**: PostgreSQL not running or wrong credentials

**Solution**:
```bash
# Check if PostgreSQL is running
pg_isready -h localhost -p 5432

# If not, start it
brew services start postgresql  # macOS
# or
docker start postgres-test      # Docker
```

###  "role 'libation' does not exist"

**Problem**: PostgreSQL user not created

**Solution**:
```bash
psql -U postgres
CREATE USER libation WITH PASSWORD 'changeme';
CREATE DATABASE libation_test OWNER libation;
GRANT ALL PRIVILEGES ON DATABASE libation_test TO libation;
\q
```

### "Worker process failed to exit gracefully"

**Problem**: Open database connections not closed

**Solution**: Already fixed with proper `afterAll` cleanup:
```javascript
afterAll(async () => {
  await db.close();
});
```

### Redis Connection Errors (Safe to Ignore)

The Redis errors in test output are expected - Redis is mocked and those are just connection attempts that get handled gracefully.

---

## CI/CD Setup

### GitHub Actions

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: libation_test
          POSTGRES_USER: libation
          POSTGRES_PASSWORD: changeme
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: |
          cd middle
          npm ci
      
      - name: Run migrations
        run: |
          cd middle
          POSTGRES_DB=libation_test npm run db:migrate
      
      - name: Run tests
        run: |
          cd middle
          npm test
```

---

## Test Data Cleanup

### Automatic Cleanup

Tests automatically clean up after themselves:

```javascript
afterEach(async () => {
  if (testUserIds.length > 0) {
    await db.query(
      `DELETE FROM users WHERE id = ANY($1::int[])`,
      [testUserIds]
    );
    testUserIds = [];
  }
});
```

### Manual Cleanup

If tests are interrupted:

```bash
# Clean up test data
psql -U libation -d libation_test
DELETE FROM users WHERE email LIKE '%@example.com';
DELETE FROM users WHERE email LIKE '%@test.com';
\q
```

---

## Quick Reference

```bash
# Install dependencies
npm install

# Run unit tests only (fast, no database)
npx jest --testPathIgnorePatterns=database.test.js

# Run all tests (needs PostgreSQL)
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage

# Run specific test
npx jest auth.test.js

# Run tests matching pattern
npx jest --testNamePattern="should register"
```

---

## Test Summary

**✅ 98 Unit Tests** - Fast, no dependencies, always run  
**🗄️ 32 Database Tests** - Require PostgreSQL, comprehensive coverage  
**📊 Total: 130 Tests** - Complete test suite

**All tests now use real database connections or proper mocks!** 🚀
