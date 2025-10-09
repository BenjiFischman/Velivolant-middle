const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

// Use postgres user for setup (has permissions to create databases and roles)
const setupPool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: process.env.POSTGRES_PORT || 5432,
  database: 'postgres', // Connect to default database
  user: 'postgres',
  password: process.env.POSTGRES_PASSWORD || ''
});

const testDbName = 'libation_test';
const testUser = 'libation';
const testPassword = 'changeme';

async function setupDatabase() {
  let client;
  
  try {
    client = await setupPool.connect();
    
    // 1. Create role if it doesn't exist
    const roleCheck = await client.query(
      `SELECT 1 FROM pg_roles WHERE rolname = '${testUser}'`
    );
    
    if (roleCheck.rows.length === 0) {
      console.log(`Creating role ${testUser}...`);
      await client.query(`CREATE ROLE ${testUser} WITH LOGIN PASSWORD '${testPassword}'`);
    }
    
    // 2. Drop and recreate test database for fresh state
    console.log(`Dropping ${testDbName} if exists...`);
    await client.query(`DROP DATABASE IF EXISTS ${testDbName}`);
    
    console.log(`Creating ${testDbName}...`);
    await client.query(`CREATE DATABASE ${testDbName} OWNER ${testUser}`);
    
    client.release();
    
    // 3. Connect to test database and run migrations
    const testPool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: process.env.POSTGRES_PORT || 5432,
      database: testDbName,
      user: testUser,
      password: testPassword
    });
    
    const testClient = await testPool.connect();
    
    console.log('Running migrations on test database...');
    
    // Read and execute migration file
    const migrationFile = path.join(__dirname, '../db/migrations/001_create_tables.sql');
    const migrationSQL = await fs.readFile(migrationFile, 'utf8');
    
    await testClient.query(migrationSQL);
    console.log('Migrations completed successfully');
    
    testClient.release();
    await testPool.end();
    
    console.log('✅ Test database setup complete');
    
  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
    throw error;
  } finally {
    if (client) client.release();
    await setupPool.end();
  }
}

async function teardownDatabase() {
  let client;
  
  try {
    client = await setupPool.connect();
    
    // Drop test database
    console.log(`\nCleaning up: Dropping ${testDbName}...`);
    await client.query(`DROP DATABASE IF EXISTS ${testDbName}`);
    
    console.log('✅ Test database cleaned up');
    
  } catch (error) {
    console.error('❌ Database teardown failed:', error.message);
  } finally {
    if (client) client.release();
    await setupPool.end();
  }
}

module.exports = {
  setupDatabase,
  teardownDatabase
};
