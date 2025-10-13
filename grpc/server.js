const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const authController = require('../controllers/authController');
const db = require('../db/postgres');
const logger = require('../logger/winstonConfig');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

// Load proto file
const PROTO_PATH = path.join(__dirname, '../../proto/velivolant.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
const velivolant = protoDescriptor.velivolant;

// Helper functions
const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

const verifyPassword = async (password, hash) => {
  return bcrypt.compare(password, hash);
};

const generateToken = (userId, email, role = 'user') => {
  return jwt.sign(
    { id: userId, email, role },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
};

// Auth Service Implementation
const authService = {
  async Login(call, callback) {
    try {
      const { email_or_username, password } = call.request;

      // Find user
      const userResult = await db.query(
        `SELECT u.id, u.username, u.email, u.password_hash, u.is_active,
                a.account_id, a.first_name, a.last_name, a.email_verified, a.balance
         FROM users u
         LEFT JOIN accounts a ON u.id = a.user_id
         WHERE u.email = $1 OR u.username = $1`,
        [email_or_username]
      );

      if (userResult.rows.length === 0) {
        return callback(null, {
          success: false,
          message: 'Invalid credentials',
          token: '',
          user: null,
        });
      }

      const user = userResult.rows[0];

      // Verify password
      const isValidPassword = await verifyPassword(password, user.password_hash);
      if (!isValidPassword) {
        return callback(null, {
          success: false,
          message: 'Invalid credentials',
          token: '',
          user: null,
        });
      }

      // Check if active
      if (!user.is_active) {
        return callback(null, {
          success: false,
          message: 'Account is deactivated',
          token: '',
          user: null,
        });
      }

      // Generate token
      const token = generateToken(user.id, user.email, 'user');

      // Update last login
      await db.query(
        'UPDATE accounts SET last_login = CURRENT_TIMESTAMP WHERE user_id = $1',
        [user.id]
      );

      logger.info('gRPC login successful', { userId: user.id, email: user.email });

      callback(null, {
        success: true,
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          first_name: user.first_name || '',
          last_name: user.last_name || '',
          email_verified: user.email_verified || false,
          balance: parseFloat(user.balance) || 0,
        },
      });
    } catch (error) {
      logger.error('gRPC Login error:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: 'Internal server error',
      });
    }
  },

  async Register(call, callback) {
    try {
      const { username, email, password, first_name, last_name } = call.request;

      // Check if user exists
      const existingUser = await db.query(
        'SELECT id FROM users WHERE email = $1 OR username = $2',
        [email, username]
      );

      if (existingUser.rows.length > 0) {
        return callback(null, {
          success: false,
          message: 'Email or username already exists',
          token: '',
          user: null,
        });
      }

      // Hash password
      const passwordHash = await hashPassword(password);
      const salt = await bcrypt.genSalt(10);

      // Create user in transaction
      const result = await db.transaction(async (client) => {
        // Insert user
        const userResult = await client.query(
          `INSERT INTO users (username, email, password_hash, salt, display_name) 
           VALUES ($1, $2, $3, $4, $5) 
           RETURNING id, username, email, display_name, created_at`,
          [username, email, passwordHash, salt, username]
        );

        const user = userResult.rows[0];

        // Insert account
        const accountResult = await client.query(
          `INSERT INTO accounts (user_id, first_name, last_name, email_verified, phone_verified) 
           VALUES ($1, $2, $3, $4, $5) 
           RETURNING account_id, first_name, last_name, email_verified, balance`,
          [user.id, first_name || '', last_name || '', false, false]
        );

        const account = accountResult.rows[0];

        return { user, account };
      });

      // Generate token
      const token = generateToken(result.user.id, email, 'user');

      logger.info('gRPC user registered', { 
        userId: result.user.id, 
        email, 
        username 
      });

      callback(null, {
        success: true,
        message: 'Account created successfully',
        token,
        user: {
          id: result.user.id,
          username: result.user.username,
          email: result.user.email,
          first_name: result.account.first_name,
          last_name: result.account.last_name,
          email_verified: result.account.email_verified,
          balance: parseFloat(result.account.balance),
        },
      });
    } catch (error) {
      logger.error('gRPC Register error:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: 'Registration failed',
      });
    }
  },

  async VerifyToken(call, callback) {
    try {
      const { token } = call.request;

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      callback(null, {
        valid: true,
        user_id: decoded.id,
        email: decoded.email,
      });
    } catch (error) {
      callback(null, {
        valid: false,
        user_id: 0,
        email: '',
      });
    }
  },

  async GetUser(call, callback) {
    try {
      const { user_id } = call.request;

      const result = await db.query(
        `SELECT u.id, u.username, u.email,
                a.first_name, a.last_name, a.email_verified, a.balance
         FROM users u
         LEFT JOIN accounts a ON u.id = a.user_id
         WHERE u.id = $1`,
        [user_id]
      );

      if (result.rows.length === 0) {
        return callback({
          code: grpc.status.NOT_FOUND,
          message: 'User not found',
        });
      }

      const user = result.rows[0];

      callback(null, {
        success: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          first_name: user.first_name || '',
          last_name: user.last_name || '',
          email_verified: user.email_verified || false,
          balance: parseFloat(user.balance) || 0,
        },
      });
    } catch (error) {
      logger.error('gRPC GetUser error:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: 'Failed to get user',
      });
    }
  },
};

// Libation Service Implementation
const libationService = {
  async RecordLibation(call, callback) {
    try {
      const { user_id, event_id, bac, timestamp } = call.request;

      const result = await db.query(
        `INSERT INTO libation_scores (user_id, event_id, bac, timestamp) 
         VALUES ($1, $2, $3, to_timestamp($4 / 1000.0)) 
         RETURNING id`,
        [user_id, event_id, bac, timestamp]
      );

      // Update lifetime max BAC if needed
      await db.query(
        `UPDATE accounts 
         SET lifetime_max_bac = GREATEST(lifetime_max_bac, $1::DECIMAL(4,3))
         WHERE user_id = $2`,
        [bac, user_id]
      );

      logger.info('gRPC libation recorded', { 
        libationId: result.rows[0].id,
        userId: user_id,
        eventId: event_id,
        bac 
      });

      callback(null, {
        success: true,
        message: 'Libation recorded successfully',
        libation_id: result.rows[0].id,
      });
    } catch (error) {
      logger.error('gRPC RecordLibation error:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: 'Failed to record libation',
      });
    }
  },

  async GetUserLibations(call, callback) {
    try {
      const { user_id, limit, offset } = call.request;

      const result = await db.query(
        `SELECT id, user_id, event_id, bac, 
                EXTRACT(EPOCH FROM timestamp)::bigint * 1000 as timestamp
         FROM libation_scores
         WHERE user_id = $1
         ORDER BY timestamp DESC
         LIMIT $2 OFFSET $3`,
        [user_id, limit || 50, offset || 0]
      );

      const countResult = await db.query(
        'SELECT COUNT(*) as count FROM libation_scores WHERE user_id = $1',
        [user_id]
      );

      callback(null, {
        libations: result.rows.map(row => ({
          id: row.id,
          user_id: row.user_id,
          event_id: row.event_id,
          bac: row.bac,
          timestamp: row.timestamp,
        })),
        total_count: parseInt(countResult.rows[0].count),
      });
    } catch (error) {
      logger.error('gRPC GetUserLibations error:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: 'Failed to get libations',
      });
    }
  },

  async GetEventLibations(call, callback) {
    try {
      const { event_id, limit, offset } = call.request;

      const result = await db.query(
        `SELECT id, user_id, event_id, bac,
                EXTRACT(EPOCH FROM timestamp)::bigint * 1000 as timestamp
         FROM libation_scores
         WHERE event_id = $1
         ORDER BY timestamp DESC
         LIMIT $2 OFFSET $3`,
        [event_id, limit || 50, offset || 0]
      );

      const countResult = await db.query(
        'SELECT COUNT(*) as count FROM libation_scores WHERE event_id = $1',
        [event_id]
      );

      callback(null, {
        libations: result.rows.map(row => ({
          id: row.id,
          user_id: row.user_id,
          event_id: row.event_id,
          bac: row.bac,
          timestamp: row.timestamp,
        })),
        total_count: parseInt(countResult.rows[0].count),
      });
    } catch (error) {
      logger.error('gRPC GetEventLibations error:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: 'Failed to get event libations',
      });
    }
  },

  // Server-side streaming
  async StreamLibations(call) {
    const { event_id } = call.request;

    // This is a simplified implementation
    // In production, you'd want to use database listeners or a message queue
    const interval = setInterval(async () => {
      try {
        const result = await db.query(
          `SELECT id, user_id, event_id, bac,
                  EXTRACT(EPOCH FROM timestamp)::bigint * 1000 as timestamp
           FROM libation_scores
           WHERE event_id = $1
           ORDER BY timestamp DESC
           LIMIT 1`,
          [event_id]
        );

        if (result.rows.length > 0) {
          const row = result.rows[0];
          call.write({
            libation: {
              id: row.id,
              user_id: row.user_id,
              event_id: row.event_id,
              bac: row.bac,
              timestamp: row.timestamp,
            },
            update_type: 'NEW',
          });
        }
      } catch (error) {
        logger.error('Stream error:', error);
      }
    }, 5000); // Poll every 5 seconds

    call.on('cancelled', () => {
      clearInterval(interval);
      logger.info('Stream cancelled', { eventId: event_id });
    });
  },
};

// Event Service Implementation
const eventService = {
  async CreateEvent(call, callback) {
    try {
      const { 
        name, 
        description, 
        start_time, 
        end_time, 
        organizer_id, 
        location, 
        max_participants 
      } = call.request;

      const result = await db.query(
        `INSERT INTO events (name, description, start_time, end_time, organizer_id, location, max_participants, type, status) 
         VALUES ($1, $2, to_timestamp($3 / 1000.0), to_timestamp($4 / 1000.0), $5, $6, $7, 0, 0) 
         RETURNING event_id, name, description, 
                   EXTRACT(EPOCH FROM start_time)::bigint * 1000 as start_time,
                   EXTRACT(EPOCH FROM end_time)::bigint * 1000 as end_time,
                   organizer_id, location, max_participants, type, status`,
        [name, description, start_time, end_time, organizer_id, location, max_participants]
      );

      const event = result.rows[0];

      logger.info('gRPC event created', { eventId: event.event_id });

      callback(null, {
        success: true,
        event: {
          event_id: event.event_id,
          name: event.name,
          description: event.description,
          start_time: event.start_time,
          end_time: event.end_time,
          organizer_id: event.organizer_id,
          location: event.location,
          max_participants: event.max_participants,
          type: event.type,
          status: event.status,
        },
      });
    } catch (error) {
      logger.error('gRPC CreateEvent error:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: 'Failed to create event',
      });
    }
  },

  async GetEvent(call, callback) {
    try {
      const { event_id } = call.request;

      const result = await db.query(
        `SELECT event_id, name, description,
                EXTRACT(EPOCH FROM start_time)::bigint * 1000 as start_time,
                EXTRACT(EPOCH FROM end_time)::bigint * 1000 as end_time,
                organizer_id, location, max_participants, type, status
         FROM events
         WHERE event_id = $1`,
        [event_id]
      );

      if (result.rows.length === 0) {
        return callback({
          code: grpc.status.NOT_FOUND,
          message: 'Event not found',
        });
      }

      const event = result.rows[0];

      callback(null, {
        success: true,
        event: {
          event_id: event.event_id,
          name: event.name,
          description: event.description,
          start_time: event.start_time,
          end_time: event.end_time,
          organizer_id: event.organizer_id,
          location: event.location,
          max_participants: event.max_participants,
          type: event.type,
          status: event.status,
        },
      });
    } catch (error) {
      logger.error('gRPC GetEvent error:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: 'Failed to get event',
      });
    }
  },

  async ListEvents(call, callback) {
    try {
      const { limit, offset, status } = call.request;

      let query = `SELECT event_id, name, description,
                          EXTRACT(EPOCH FROM start_time)::bigint * 1000 as start_time,
                          EXTRACT(EPOCH FROM end_time)::bigint * 1000 as end_time,
                          organizer_id, location, max_participants, type, status
                   FROM events`;
      const params = [];
      
      if (status !== undefined && status >= 0) {
        query += ' WHERE status = $1';
        params.push(status);
      }

      query += ' ORDER BY start_time DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
      params.push(limit || 50, offset || 0);

      const result = await db.query(query, params);

      const countQuery = status !== undefined && status >= 0
        ? 'SELECT COUNT(*) as count FROM events WHERE status = $1'
        : 'SELECT COUNT(*) as count FROM events';
      const countParams = status !== undefined && status >= 0 ? [status] : [];
      const countResult = await db.query(countQuery, countParams);

      callback(null, {
        events: result.rows.map(event => ({
          event_id: event.event_id,
          name: event.name,
          description: event.description,
          start_time: event.start_time,
          end_time: event.end_time,
          organizer_id: event.organizer_id,
          location: event.location,
          max_participants: event.max_participants,
          type: event.type,
          status: event.status,
        })),
        total_count: parseInt(countResult.rows[0].count),
      });
    } catch (error) {
      logger.error('gRPC ListEvents error:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: 'Failed to list events',
      });
    }
  },

  async JoinEvent(call, callback) {
    try {
      const { event_id, account_id } = call.request;

      // Check if already joined
      const existing = await db.query(
        'SELECT 1 FROM event_participants WHERE event_id = $1 AND account_id = $2',
        [event_id, account_id]
      );

      if (existing.rows.length > 0) {
        return callback(null, {
          success: false,
          message: 'Already joined this event',
        });
      }

      // Check max participants
      const eventResult = await db.query(
        `SELECT max_participants,
                (SELECT COUNT(*) FROM event_participants WHERE event_id = $1) as current_count
         FROM events
         WHERE event_id = $1`,
        [event_id]
      );

      if (eventResult.rows.length === 0) {
        return callback({
          code: grpc.status.NOT_FOUND,
          message: 'Event not found',
        });
      }

      const { max_participants, current_count } = eventResult.rows[0];
      if (max_participants !== -1 && current_count >= max_participants) {
        return callback(null, {
          success: false,
          message: 'Event is full',
        });
      }

      // Join event
      await db.query(
        'INSERT INTO event_participants (event_id, account_id) VALUES ($1, $2)',
        [event_id, account_id]
      );

      logger.info('gRPC user joined event', { eventId: event_id, accountId: account_id });

      callback(null, {
        success: true,
        message: 'Successfully joined event',
      });
    } catch (error) {
      logger.error('gRPC JoinEvent error:', error);
      callback({
        code: grpc.status.INTERNAL,
        message: 'Failed to join event',
      });
    }
  },
};

// Create and start gRPC server
function startGrpcServer(port = 50051) {
  const server = new grpc.Server();

  server.addService(velivolant.AuthService.service, authService);
  server.addService(velivolant.LibationService.service, libationService);
  server.addService(velivolant.EventService.service, eventService);

  server.bindAsync(
    `0.0.0.0:${port}`,
    grpc.ServerCredentials.createInsecure(),
    (error, boundPort) => {
      if (error) {
        logger.error('Failed to start gRPC server', { error: error.message });
        return;
      }
      
      logger.info('gRPC server started', { port: boundPort });
    }
  );

  return server;
}

module.exports = { startGrpcServer };

