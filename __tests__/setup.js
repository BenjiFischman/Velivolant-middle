// Test setup file
// This file runs before all tests

const { setupDatabase, teardownDatabase } = require('./setupDatabase');

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.SESSION_SECRET = 'test-session-secret';
process.env.COOKIE_SECRET = 'test-cookie-secret';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

// PostgreSQL test configuration
process.env.POSTGRES_HOST = process.env.TEST_POSTGRES_HOST || 'localhost';
process.env.POSTGRES_PORT = process.env.TEST_POSTGRES_PORT || '5432';
process.env.POSTGRES_DB = 'libation_test';
process.env.POSTGRES_USER = 'libation';
process.env.POSTGRES_PASSWORD = 'changeme';

// Frontend URL
process.env.FRONTEND_URL = 'http://localhost:8080';

// Set longer timeout for database integration tests
jest.setTimeout(30000);

// Global test utilities
global.generateTestEmail = () => {
  return `test_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`;
};

global.generateTestUsername = () => {
  return `user_${Date.now()}_${Math.random().toString(36).substring(7)}`;
};

// Setup database before all tests
beforeAll(async () => {
  console.log('\n🔧 Setting up test database...');
  try {
    await setupDatabase();
  } catch (error) {
    console.error('Failed to setup database:', error.message);
    console.log('\nSkipping database tests. Run unit tests only with:');
    console.log('  npx jest --testPathIgnorePatterns=database.test.js\n');
  }
});

// Teardown database after all tests
afterAll(async () => {
  try {
    await teardownDatabase();
  } catch (error) {
    console.error('Failed to teardown database:', error.message);
  }
});
