const { Pool } = require('pg');
const logger = require('../logger/winstonConfig');

class PostgresClient {
  constructor() {
    this.pool = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: process.env.POSTGRES_PORT || 5432,
      database: process.env.POSTGRES_DB || 'libation_db',
      user: process.env.POSTGRES_USER || 'libation',
      password: process.env.POSTGRES_PASSWORD || 'changeme',
      max: 20, // Maximum pool size
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Handle connection errors
    this.pool.on('error', (err) => {
      logger.error('Unexpected PostgreSQL error', { error: err.message });
    });

    // Test connection on initialization
    this.testConnection();
  }

  async testConnection() {
    try {
      const client = await this.pool.connect();
      logger.info('PostgreSQL connected successfully', {
        database: process.env.POSTGRES_DB,
        host: process.env.POSTGRES_HOST,
      });
      client.release();
    } catch (error) {
      logger.error('PostgreSQL connection failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Execute a query with parameters
   */
  async query(text, params) {
    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      
      logger.debug('Executed query', {
        query: text,
        duration: `${duration}ms`,
        rows: result.rowCount,
      });
      
      return result;
    } catch (error) {
      logger.error('Query error', {
        query: text,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get a client from the pool for transactions
   */
  async getClient() {
    const client = await this.pool.connect();
    const query = client.query.bind(client);
    const release = client.release.bind(client);

    // Override release to log
    client.release = () => {
      client.release = release;
      return release();
    };

    return client;
  }

  /**
   * Execute a transaction
   */
  async transaction(callback) {
    const client = await this.getClient();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Close all connections
   */
  async close() {
    await this.pool.end();
    logger.info('PostgreSQL pool closed');
  }
}

// Export singleton instance
const postgresClient = new PostgresClient();

module.exports = postgresClient;
