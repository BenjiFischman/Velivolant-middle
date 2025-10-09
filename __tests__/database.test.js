const db = require('../db/postgres');

describe('PostgreSQL Database', () => {
  let testUserIds = [];

  beforeAll(async () => {
    // Ensure we're in test mode
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('Tests must run in NODE_ENV=test');
    }

    // Wait for database connection
    try {
      await db.query('SELECT 1');
    } catch (error) {
      console.warn('Database not available, tests may fail:', error.message);
    }
  });

  afterEach(async () => {
    // Cleanup test data after each test
    if (testUserIds.length > 0) {
      try {
        await db.query(
          `DELETE FROM users WHERE id = ANY($1::int[])`,
          [testUserIds]
        );
      } catch (error) {
        // Ignore cleanup errors
      }
      testUserIds = [];
    }
  });

  afterAll(async () => {
    await db.close();
  });

  describe('Connection', () => {
    it('should connect to PostgreSQL successfully', async () => {
      const result = await db.query('SELECT NOW() as now');
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].now).toBeDefined();
    });

    it('should have a valid connection pool', () => {
      expect(db.pool).toBeDefined();
      expect(db.pool.totalCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Users Table', () => {
    it('should insert a new user', async () => {
      const username = `testuser_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const email = `test_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`;
      
      const result = await db.query(
        `INSERT INTO users (username, email, password_hash, salt) 
         VALUES ($1, $2, $3, $4) 
         RETURNING id, username, email`,
        [username, email, 'hash123', 'salt123']
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].username).toBe(username);
      expect(result.rows[0].email).toBe(email);
      
      testUserIds.push(result.rows[0].id);
    });

    it('should find user by email', async () => {
      const username = `finduser_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const email = `find_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`;
      
      // Insert user
      const insertResult = await db.query(
        'INSERT INTO users (username, email, password_hash, salt) VALUES ($1, $2, $3, $4) RETURNING id',
        [username, email, 'hash', 'salt']
      );

      testUserIds.push(insertResult.rows[0].id);

      // Find by email
      const result = await db.query(
        'SELECT * FROM users WHERE email = $1',
        [email]
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].email).toBe(email);
    });

    it('should find user by username', async () => {
      const username = `queryuser_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const email = `query_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`;
      
      const insertResult = await db.query(
        'INSERT INTO users (username, email, password_hash, salt) VALUES ($1, $2, $3, $4) RETURNING id',
        [username, email, 'hash', 'salt']
      );

      testUserIds.push(insertResult.rows[0].id);

      const result = await db.query(
        'SELECT * FROM users WHERE username = $1',
        [username]
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].username).toBe(username);
    });

    it('should enforce unique email constraint', async () => {
      const email = `unique_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`;
      const username1 = `user1_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const username2 = `user2_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      const insertResult = await db.query(
        'INSERT INTO users (username, email, password_hash, salt) VALUES ($1, $2, $3, $4) RETURNING id',
        [username1, email, 'hash', 'salt']
      );

      testUserIds.push(insertResult.rows[0].id);

      // Try to insert duplicate email
      await expect(
        db.query(
          'INSERT INTO users (username, email, password_hash, salt) VALUES ($1, $2, $3, $4)',
          [username2, email, 'hash', 'salt']
        )
      ).rejects.toThrow();
    });

    it('should enforce unique username constraint', async () => {
      const username = `uniqueuser_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const email1 = `email1_${Date.now()}_${Math.random().toString(36).substring(7)}@test.com`;
      const email2 = `email2_${Date.now()}_${Math.random().toString(36).substring(7)}@test.com`;
      
      const insertResult = await db.query(
        'INSERT INTO users (username, email, password_hash, salt) VALUES ($1, $2, $3, $4) RETURNING id',
        [username, email1, 'hash', 'salt']
      );

      testUserIds.push(insertResult.rows[0].id);

      await expect(
        db.query(
          'INSERT INTO users (username, email, password_hash, salt) VALUES ($1, $2, $3, $4)',
          [username, email2, 'hash', 'salt']
        )
      ).rejects.toThrow();
    });

    it('should update user fields', async () => {
      const username = `updateuser_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const email = `update_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`;
      
      const insertResult = await db.query(
        'INSERT INTO users (username, email, password_hash, salt) VALUES ($1, $2, $3, $4) RETURNING id',
        [username, email, 'oldhash', 'oldsalt']
      );

      const userId = insertResult.rows[0].id;
      testUserIds.push(userId);

      // Update password
      await db.query(
        'UPDATE users SET password_hash = $1, salt = $2 WHERE id = $3',
        ['newhash', 'newsalt', userId]
      );

      // Verify update
      const result = await db.query(
        'SELECT password_hash, salt FROM users WHERE id = $1',
        [userId]
      );

      expect(result.rows[0].password_hash).toBe('newhash');
      expect(result.rows[0].salt).toBe('newsalt');
    });
  });

  describe('Accounts Table', () => {
    it('should create account linked to user', async () => {
      const username = `acctuser_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const email = `acct_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`;
      
      // Create user first
      const userResult = await db.query(
        'INSERT INTO users (username, email, password_hash, salt) VALUES ($1, $2, $3, $4) RETURNING id',
        [username, email, 'hash', 'salt']
      );

      const userId = userResult.rows[0].id;
      testUserIds.push(userId);

      // Create account
      const accountResult = await db.query(
        `INSERT INTO accounts (user_id, first_name, last_name, balance) 
         VALUES ($1, $2, $3, $4) 
         RETURNING account_id, first_name, last_name, balance`,
        [userId, 'John', 'Doe', 100.50]
      );

      expect(accountResult.rows).toHaveLength(1);
      expect(accountResult.rows[0].first_name).toBe('John');
      expect(accountResult.rows[0].last_name).toBe('Doe');
      expect(parseFloat(accountResult.rows[0].balance)).toBe(100.50);
    });

    it('should join users and accounts', async () => {
      const username = `joinuser_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const email = `join_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`;
      
      const userResult = await db.query(
        'INSERT INTO users (username, email, password_hash, salt) VALUES ($1, $2, $3, $4) RETURNING id',
        [username, email, 'hash', 'salt']
      );

      const userId = userResult.rows[0].id;
      testUserIds.push(userId);

      await db.query(
        'INSERT INTO accounts (user_id, first_name, last_name) VALUES ($1, $2, $3)',
        [userId, 'Jane', 'Smith']
      );

      // Join query
      const result = await db.query(
        `SELECT u.username, u.email, a.first_name, a.last_name 
         FROM users u 
         LEFT JOIN accounts a ON u.id = a.user_id 
         WHERE u.id = $1`,
        [userId]
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].username).toBe(username);
      expect(result.rows[0].first_name).toBe('Jane');
    });

    it('should enforce foreign key constraint', async () => {
      // Try to create account with non-existent user_id
      await expect(
        db.query(
          'INSERT INTO accounts (user_id, first_name) VALUES ($1, $2)',
          [999999, 'Test']
        )
      ).rejects.toThrow();
    });

    it('should enforce balance positive check', async () => {
      const username = `baluser_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const email = `bal_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`;
      
      const userResult = await db.query(
        'INSERT INTO users (username, email, password_hash, salt) VALUES ($1, $2, $3, $4) RETURNING id',
        [username, email, 'hash', 'salt']
      );

      testUserIds.push(userResult.rows[0].id);

      // Try to set negative balance
      await expect(
        db.query(
          'INSERT INTO accounts (user_id, balance) VALUES ($1, $2)',
          [userResult.rows[0].id, -10.00]
        )
      ).rejects.toThrow();
    });
  });

  describe('Password Reset Tokens', () => {
    it('should create password reset token', async () => {
      const username = `resetuser_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const email = `reset_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`;
      
      const userResult = await db.query(
        'INSERT INTO users (username, email, password_hash, salt) VALUES ($1, $2, $3, $4) RETURNING id',
        [username, email, 'hash', 'salt']
      );

      const userId = userResult.rows[0].id;
      testUserIds.push(userId);
      
      const token = `reset_token_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      const result = await db.query(
        'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3) RETURNING id, token',
        [userId, token, expiresAt]
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].token).toBe(token);
    });

    it('should find valid reset token', async () => {
      const username = `validtoken_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const email = `validtoken_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`;
      
      const userResult = await db.query(
        'INSERT INTO users (username, email, password_hash, salt) VALUES ($1, $2, $3, $4) RETURNING id',
        [username, email, 'hash', 'salt']
      );

      testUserIds.push(userResult.rows[0].id);

      const token = `valid_token_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await db.query(
        'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
        [userResult.rows[0].id, token, expiresAt]
      );

      const result = await db.query(
        'SELECT * FROM password_reset_tokens WHERE token = $1 AND used = FALSE',
        [token]
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].used).toBe(false);
    });

    it('should mark token as used', async () => {
      const username = `usedtoken_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const email = `usedtoken_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`;
      
      const userResult = await db.query(
        'INSERT INTO users (username, email, password_hash, salt) VALUES ($1, $2, $3, $4) RETURNING id',
        [username, email, 'hash', 'salt']
      );

      testUserIds.push(userResult.rows[0].id);

      const token = `used_token_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await db.query(
        'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
        [userResult.rows[0].id, token, expiresAt]
      );

      // Mark as used
      await db.query(
        'UPDATE password_reset_tokens SET used = TRUE WHERE token = $1',
        [token]
      );

      const result = await db.query(
        'SELECT used FROM password_reset_tokens WHERE token = $1',
        [token]
      );

      expect(result.rows[0].used).toBe(true);
    });
  });

  describe('Email Verification Tokens', () => {
    it('should create email verification token', async () => {
      const username = `emailuser_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const email = `emailver_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`;
      
      const userResult = await db.query(
        'INSERT INTO users (username, email, password_hash, salt) VALUES ($1, $2, $3, $4) RETURNING id',
        [username, email, 'hash', 'salt']
      );

      testUserIds.push(userResult.rows[0].id);

      const token = `email_token_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const result = await db.query(
        'INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES ($1, $2, $3) RETURNING id, token',
        [userResult.rows[0].id, token, expiresAt]
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].token).toBe(token);
    });

    it('should verify email with valid token', async () => {
      const username = `verifyuser_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const email = `verify_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`;
      
      const userResult = await db.query(
        'INSERT INTO users (username, email, password_hash, salt) VALUES ($1, $2, $3, $4) RETURNING id',
        [username, email, 'hash', 'salt']
      );

      const userId = userResult.rows[0].id;
      testUserIds.push(userId);

      await db.query(
        'INSERT INTO accounts (user_id, email_verified) VALUES ($1, $2)',
        [userId, false]
      );

      const token = `verify_token_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await db.query(
        'INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
        [userId, token, expiresAt]
      );

      // Verify email
      await db.transaction(async (client) => {
        await client.query(
          'UPDATE accounts SET email_verified = TRUE WHERE user_id = $1',
          [userId]
        );
        await client.query(
          'UPDATE email_verification_tokens SET used = TRUE WHERE token = $1',
          [token]
        );
      });

      // Check verification
      const result = await db.query(
        'SELECT email_verified FROM accounts WHERE user_id = $1',
        [userId]
      );

      expect(result.rows[0].email_verified).toBe(true);
    });
  });

  describe('Transactions', () => {
    it('should commit transaction on success', async () => {
      const username = `txuser_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const email = `tx_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`;

      const result = await db.transaction(async (client) => {
        const userResult = await client.query(
          'INSERT INTO users (username, email, password_hash, salt) VALUES ($1, $2, $3, $4) RETURNING id',
          [username, email, 'hash', 'salt']
        );

        const userId = userResult.rows[0].id;

        await client.query(
          'INSERT INTO accounts (user_id, first_name) VALUES ($1, $2)',
          [userId, 'Test']
        );

        return userId;
      });

      expect(result).toBeDefined();
      testUserIds.push(result);

      // Verify both inserts succeeded
      const userCheck = await db.query(
        'SELECT * FROM users WHERE username = $1',
        [username]
      );
      expect(userCheck.rows).toHaveLength(1);

      const accountCheck = await db.query(
        'SELECT * FROM accounts WHERE user_id = $1',
        [userCheck.rows[0].id]
      );
      expect(accountCheck.rows).toHaveLength(1);
    });

    it('should rollback transaction on error', async () => {
      const username = `rollback_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const email = `rollback_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`;

      await expect(
        db.transaction(async (client) => {
          await client.query(
            'INSERT INTO users (username, email, password_hash, salt) VALUES ($1, $2, $3, $4)',
            [username, email, 'hash', 'salt']
          );

          // This should fail (invalid foreign key)
          await client.query(
            'INSERT INTO accounts (user_id, first_name) VALUES ($1, $2)',
            [999999, 'Test']
          );
        })
      ).rejects.toThrow();

      // Verify user was not inserted (transaction rolled back)
      const result = await db.query(
        'SELECT * FROM users WHERE username = $1',
        [username]
      );

      expect(result.rows).toHaveLength(0);
    });
  });

  describe('Indexes', () => {
    it('should have index on users.email', async () => {
      const result = await db.query(
        `SELECT indexname FROM pg_indexes 
         WHERE tablename = 'users' AND indexname = 'idx_users_email'`
      );

      expect(result.rows.length).toBeGreaterThan(0);
    });

    it('should have index on users.username', async () => {
      const result = await db.query(
        `SELECT indexname FROM pg_indexes 
         WHERE tablename = 'users' AND indexname = 'idx_users_username'`
      );

      expect(result.rows.length).toBeGreaterThan(0);
    });
  });

  describe('Schema Migrations', () => {
    it('should have schema_migrations table', async () => {
      const result = await db.query(
        `SELECT table_name FROM information_schema.tables 
         WHERE table_name = 'schema_migrations'`
      );

      expect(result.rows).toHaveLength(1);
    });

    it('should track executed migrations', async () => {
      const result = await db.query(
        'SELECT migration_name FROM schema_migrations ORDER BY id'
      );

      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.rows[0].migration_name).toContain('.sql');
    });
  });
});
