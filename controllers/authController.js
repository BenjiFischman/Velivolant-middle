const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('../db/postgres');
const logger = require('../logger/winstonConfig');

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

const generateResetToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

const generateVerificationToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

const authController = {
  /**
   * Register a new user account
   * POST /api/auth/register
   */
  register: async (req, res) => {
    try {
      const { username, email, password, firstName, lastName } = req.body;

      // Check if user already exists
      const existingUser = await db.query(
        'SELECT id FROM users WHERE email = $1 OR username = $2',
        [email, username]
      );

      if (existingUser.rows.length > 0) {
        const isDuplicateEmail = existingUser.rows[0].email === email;
        return res.status(409).json({
          success: false,
          message: isDuplicateEmail 
            ? 'Email already registered' 
            : 'Username already taken'
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

        // Insert account record
        const accountResult = await client.query(
          `INSERT INTO accounts (user_id, first_name, last_name, email_verified, phone_verified) 
           VALUES ($1, $2, $3, $4, $5) 
           RETURNING account_id, first_name, last_name, email_verified`,
          [user.id, firstName || '', lastName || '', false, false]
        );

        const account = accountResult.rows[0];

        // Generate email verification token
        const verificationToken = generateVerificationToken();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        await client.query(
          `INSERT INTO email_verification_tokens (user_id, token, expires_at) 
           VALUES ($1, $2, $3)`,
          [user.id, verificationToken, expiresAt]
        );

        return {
          user,
          account,
          verificationToken
        };
      });

      // Generate JWT token
      const token = generateToken(result.user.id, email, 'user');

      // Set token in cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      });

      logger.info('User registered', { 
        userId: result.user.id, 
        email, 
        username 
      });

      res.status(201).json({
        success: true,
        message: 'Account created successfully',
        data: {
          user: {
            id: result.user.id,
            username: result.user.username,
            email: result.user.email,
            firstName: result.account.first_name,
            lastName: result.account.last_name,
            emailVerified: result.account.email_verified,
          },
          token,
          ...(process.env.NODE_ENV !== 'production' && { 
            verificationToken: result.verificationToken 
          })
        }
      });
    } catch (error) {
      logger.error('Registration error:', error);
      res.status(500).json({
        success: false,
        message: 'Registration failed',
        error: process.env.NODE_ENV === 'production' ? undefined : error.message
      });
    }
  },

  /**
   * Login with email/username and password
   * POST /api/auth/login
   */
  login: async (req, res) => {
    try {
      const { emailOrUsername, password } = req.body;

      // Find user by email or username
      const userResult = await db.query(
        `SELECT u.id, u.username, u.email, u.password_hash, u.is_active,
                a.account_id, a.first_name, a.last_name, a.email_verified
         FROM users u
         LEFT JOIN accounts a ON u.id = a.user_id
         WHERE u.email = $1 OR u.username = $1`,
        [emailOrUsername]
      );

      if (userResult.rows.length === 0) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      const user = userResult.rows[0];

      // Verify password
      const isValidPassword = await verifyPassword(password, user.password_hash);
      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      // Check if account is active
      if (!user.is_active) {
        return res.status(403).json({
          success: false,
          message: 'Account is deactivated'
        });
      }

      // Update last login
      await db.query(
        'UPDATE accounts SET last_login = CURRENT_TIMESTAMP WHERE user_id = $1',
        [user.id]
      );

      // Generate JWT token
      const token = generateToken(user.id, user.email, 'user');

      // Set token in cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000
      });

      logger.info('User logged in', { userId: user.id, email: user.email });

      res.json({
        success: true,
        message: 'Login successful',
        data: {
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            emailVerified: user.email_verified,
            role: 'user',
          },
          token
        }
      });
    } catch (error) {
      logger.error('Login error:', error);
      res.status(500).json({
        success: false,
        message: 'Login failed',
        error: process.env.NODE_ENV === 'production' ? undefined : error.message
      });
    }
  },

  /**
   * Logout user
   * POST /api/auth/logout
   */
  logout: async (req, res) => {
    res.clearCookie('token');
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  },

  /**
   * Request password reset
   * POST /api/auth/password/reset-request
   */
  requestPasswordReset: async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Email is required'
        });
      }

      // Find user by email
      const userResult = await db.query(
        'SELECT id FROM users WHERE email = $1',
        [email]
      );

      // Always return success (don't reveal if email exists)
      if (userResult.rows.length === 0) {
        logger.info('Password reset requested for non-existent email', { email });
        return res.json({
          success: true,
          message: 'If the email exists, a reset link has been sent'
        });
      }

      const userId = userResult.rows[0].id;

      // Generate reset token
      const resetToken = generateResetToken();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Store reset token
      await db.query(
        `INSERT INTO password_reset_tokens (user_id, token, expires_at) 
         VALUES ($1, $2, $3)`,
        [userId, resetToken, expiresAt]
      );

      logger.info('Password reset requested', { userId, email });

      // In production, send email with reset link
      // For now, return token in response (ONLY FOR DEVELOPMENT)
      res.json({
        success: true,
        message: 'If the email exists, a reset link has been sent',
        ...(process.env.NODE_ENV !== 'production' && { resetToken })
      });
    } catch (error) {
      logger.error('Password reset request error:', error);
      res.status(500).json({
        success: false,
        message: 'Password reset request failed'
      });
    }
  },

  /**
   * Verify reset token is valid
   * POST /api/auth/password/reset-verify
   */
  verifyResetToken: async (req, res) => {
    try {
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({
          success: false,
          message: 'Reset token is required'
        });
      }

      const result = await db.query(
        `SELECT user_id, expires_at, used 
         FROM password_reset_tokens 
         WHERE token = $1`,
        [token]
      );

      if (result.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired reset token'
        });
      }

      const resetData = result.rows[0];

      // Check if token is expired or already used
      if (new Date() > resetData.expires_at || resetData.used) {
        return res.status(400).json({
          success: false,
          message: 'Reset token has expired or been used'
        });
      }

      res.json({
        success: true,
        message: 'Token is valid'
      });
    } catch (error) {
      logger.error('Token verification error:', error);
      res.status(500).json({
        success: false,
        message: 'Token verification failed'
      });
    }
  },

  /**
   * Confirm password reset with new password
   * POST /api/auth/password/reset-confirm
   */
  confirmPasswordReset: async (req, res) => {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        return res.status(400).json({
          success: false,
          message: 'Token and new password are required'
        });
      }

      // Validate password strength
      if (newPassword.length < 8) {
        return res.status(400).json({
          success: false,
          message: 'Password must be at least 8 characters long'
        });
      }

      // Find and validate token
      const tokenResult = await db.query(
        `SELECT user_id, expires_at, used 
         FROM password_reset_tokens 
         WHERE token = $1`,
        [token]
      );

      if (tokenResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid reset token'
        });
      }

      const resetData = tokenResult.rows[0];

      if (new Date() > resetData.expires_at || resetData.used) {
        return res.status(400).json({
          success: false,
          message: 'Reset token has expired or been used'
        });
      }

      // Hash new password
      const newPasswordHash = await hashPassword(newPassword);
      const newSalt = await bcrypt.genSalt(10);

      // Update password and mark token as used in transaction
      await db.transaction(async (client) => {
        await client.query(
          'UPDATE users SET password_hash = $1, salt = $2 WHERE id = $3',
          [newPasswordHash, newSalt, resetData.user_id]
        );

        await client.query(
          'UPDATE password_reset_tokens SET used = TRUE WHERE token = $1',
          [token]
        );
      });

      logger.info('Password reset completed', { userId: resetData.user_id });

      res.json({
        success: true,
        message: 'Password reset successfully'
      });
    } catch (error) {
      logger.error('Password reset confirmation error:', error);
      res.status(500).json({
        success: false,
        message: 'Password reset failed'
      });
    }
  },

  /**
   * Change password (authenticated user)
   * POST /api/auth/password/change
   */
  changePassword: async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user.id;

      // Get user's current password hash
      const userResult = await db.query(
        'SELECT password_hash FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      const user = userResult.rows[0];

      // Verify current password
      const isValidPassword = await verifyPassword(currentPassword, user.password_hash);
      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          message: 'Current password is incorrect'
        });
      }

      // Hash new password
      const newPasswordHash = await hashPassword(newPassword);
      const newSalt = await bcrypt.genSalt(10);

      // Update password
      await db.query(
        'UPDATE users SET password_hash = $1, salt = $2 WHERE id = $3',
        [newPasswordHash, newSalt, userId]
      );

      logger.info('Password changed', { userId });

      res.json({
        success: true,
        message: 'Password changed successfully'
      });
    } catch (error) {
      logger.error('Password change error:', error);
      res.status(500).json({
        success: false,
        message: 'Password change failed'
      });
    }
  },

  /**
   * Get current authenticated user
   * GET /api/auth/me
   */
  getCurrentUser: async (req, res) => {
    try {
      const result = await db.query(
        `SELECT u.id, u.username, u.email, u.is_active, u.created_at,
                a.account_id, a.first_name, a.last_name, a.email_verified, 
                a.balance, a.last_login
         FROM users u
         LEFT JOIN accounts a ON u.id = a.user_id
         WHERE u.id = $1`,
        [req.user.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      const user = result.rows[0];

      res.json({
        success: true,
        data: {
          id: user.id,
          accountId: user.account_id,
          username: user.username,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          emailVerified: user.email_verified,
          balance: parseFloat(user.balance),
          role: 'user',
          createdAt: user.created_at,
          lastLogin: user.last_login,
        }
      });
    } catch (error) {
      logger.error('Get current user error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get user'
      });
    }
  },

  /**
   * Refresh JWT token
   * POST /api/auth/refresh
   */
  refreshToken: async (req, res) => {
    try {
      const result = await db.query(
        'SELECT id, email, is_active FROM users WHERE id = $1',
        [req.user.id]
      );

      if (result.rows.length === 0 || !result.rows[0].is_active) {
        return res.status(401).json({
          success: false,
          message: 'Invalid session'
        });
      }

      const user = result.rows[0];
      const token = generateToken(user.id, user.email, 'user');

      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000
      });

      res.json({
        success: true,
        message: 'Token refreshed',
        data: { token }
      });
    } catch (error) {
      logger.error('Token refresh error:', error);
      res.status(500).json({
        success: false,
        message: 'Token refresh failed'
      });
    }
  },

  /**
   * Verify email with token
   * POST /api/auth/email/verify
   */
  verifyEmail: async (req, res) => {
    try {
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({
          success: false,
          message: 'Verification token is required'
        });
      }

      // Find token
      const tokenResult = await db.query(
        `SELECT user_id, expires_at, used 
         FROM email_verification_tokens 
         WHERE token = $1`,
        [token]
      );

      if (tokenResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid verification token'
        });
      }

      const verificationData = tokenResult.rows[0];

      // Check if expired or used
      if (new Date() > verificationData.expires_at || verificationData.used) {
        return res.status(400).json({
          success: false,
          message: 'Verification token has expired or been used'
        });
      }

      // Update user and mark token as used in transaction
      await db.transaction(async (client) => {
        await client.query(
          'UPDATE accounts SET email_verified = TRUE WHERE user_id = $1',
          [verificationData.user_id]
        );

        await client.query(
          'UPDATE email_verification_tokens SET used = TRUE WHERE token = $1',
          [token]
        );
      });

      logger.info('Email verified', { userId: verificationData.user_id });

      res.json({
        success: true,
        message: 'Email verified successfully'
      });
    } catch (error) {
      logger.error('Email verification error:', error);
      res.status(500).json({
        success: false,
        message: 'Email verification failed'
      });
    }
  },

  /**
   * Resend email verification
   * POST /api/auth/email/resend
   */
  resendVerificationEmail: async (req, res) => {
    try {
      const userId = req.user.id;

      // Check if email is already verified
      const accountResult = await db.query(
        'SELECT email_verified FROM accounts WHERE user_id = $1',
        [userId]
      );

      if (accountResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Account not found'
        });
      }

      if (accountResult.rows[0].email_verified) {
        return res.status(400).json({
          success: false,
          message: 'Email is already verified'
        });
      }

      // Generate new verification token
      const verificationToken = generateVerificationToken();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      // Invalidate old tokens and create new one
      await db.transaction(async (client) => {
        await client.query(
          'UPDATE email_verification_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE',
          [userId]
        );

        await client.query(
          'INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
          [userId, verificationToken, expiresAt]
        );
      });

      logger.info('Verification email resent', { userId });

      res.json({
        success: true,
        message: 'Verification email sent',
        ...(process.env.NODE_ENV !== 'production' && { verificationToken })
      });
    } catch (error) {
      logger.error('Resend verification error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to resend verification email'
      });
    }
  }
};

module.exports = authController;