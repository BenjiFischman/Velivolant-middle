const fs = require('fs').promises;
const path = require('path');
const db = require('./postgres');
const logger = require('../logger/winstonConfig');

async function runMigrations() {
  try {
    logger.info('Starting database migrations...');

    // Create migrations table if it doesn't exist
    await db.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        migration_name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Get list of migration files
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = await fs.readdir(migrationsDir);
    const sqlFiles = files
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of sqlFiles) {
      // Check if migration was already executed
      const checkResult = await db.query(
        'SELECT id FROM schema_migrations WHERE migration_name = $1',
        [file]
      );

      if (checkResult.rows.length > 0) {
        logger.info(`Migration ${file} already executed, skipping`);
        continue;
      }

      // Read and execute migration
      const filePath = path.join(migrationsDir, file);
      const sql = await fs.readFile(filePath, 'utf8');

      logger.info(`Executing migration: ${file}`);
      
      await db.transaction(async (client) => {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (migration_name) VALUES ($1)',
          [file]
        );
      });

      logger.info(`Migration ${file} completed successfully`);
    }

    logger.info('All migrations completed');
  } catch (error) {
    logger.error('Migration failed', { error: error.message });
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log('✅ Migrations completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error.message);
      process.exit(1);
    });
}

module.exports = runMigrations;
