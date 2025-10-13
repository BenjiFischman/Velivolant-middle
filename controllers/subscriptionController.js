const db = require('../db/postgres');
const logger = require('../logger/winstonConfig');
const emailService = require('../services/emailService');

const subscriptionController = {
  /**
   * Create a new subscription
   * POST /api/subscriptions
   */
  createSubscription: async (req, res) => {
    try {
      const {
        subscriptionTier,
        price,
        currency = 'USD',
        billingPeriod,
        paymentMethod
      } = req.body;

      const userId = req.user.id;

      // Validate required fields
      if (!subscriptionTier || !price || !billingPeriod) {
        return res.status(400).json({
          success: false,
          message: 'Subscription tier, price, and billing period are required'
        });
      }

      // Check if user already has an active subscription
      const existingSubscription = await db.query(
        `SELECT subscription_id 
         FROM subscriptions 
         WHERE user_id = $1 AND status = 'active'`,
        [userId]
      );

      if (existingSubscription.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'User already has an active subscription'
        });
      }

      // Calculate expiration date based on billing period
      let expiresAt;
      const now = new Date();
      
      switch (billingPeriod) {
        case 'monthly':
          expiresAt = new Date(now.setMonth(now.getMonth() + 1));
          break;
        case 'yearly':
          expiresAt = new Date(now.setFullYear(now.getFullYear() + 1));
          break;
        case 'lifetime':
          expiresAt = null;
          break;
        default:
          return res.status(400).json({
            success: false,
            message: 'Invalid billing period'
          });
      }

      // Create subscription
      const result = await db.transaction(async (client) => {
        const subscriptionResult = await client.query(
          `INSERT INTO subscriptions (
            user_id, subscription_tier, status, price, currency,
            billing_period, payment_method, expires_at, next_billing_date
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *`,
          [
            userId,
            subscriptionTier,
            'active',
            price,
            currency,
            billingPeriod,
            paymentMethod,
            expiresAt,
            expiresAt
          ]
        );

        // Grant premium_consumer role if not already granted
        const premiumRoleResult = await client.query(
          'SELECT role_id FROM roles WHERE role_key = $1',
          ['premium_consumer']
        );

        if (premiumRoleResult.rows.length > 0) {
          await client.query(
            `INSERT INTO user_roles (user_id, role_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [userId, premiumRoleResult.rows[0].role_id]
          );
        }

        return subscriptionResult.rows[0];
      });

      // Send welcome email
      const userResult = await db.query(
        'SELECT email, username FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length > 0) {
        const user = userResult.rows[0];
        await emailService.sendWelcomePremiumEmail(
          user.email,
          user.username,
          subscriptionTier
        );
      }

      logger.info('Subscription created', { 
        userId, 
        subscriptionId: result.subscription_id,
        tier: subscriptionTier 
      });

      res.status(201).json({
        success: true,
        message: 'Subscription created successfully',
        data: result
      });
    } catch (error) {
      logger.error('Create subscription error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create subscription'
      });
    }
  },

  /**
   * Get user's subscriptions
   * GET /api/subscriptions
   */
  getSubscriptions: async (req, res) => {
    try {
      const userId = req.user.id;

      const result = await db.query(
        `SELECT * FROM subscriptions
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [userId]
      );

      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      logger.error('Get subscriptions error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch subscriptions'
      });
    }
  },

  /**
   * Get active subscription
   * GET /api/subscriptions/active
   */
  getActiveSubscription: async (req, res) => {
    try {
      const userId = req.user.id;

      const result = await db.query(
        `SELECT * FROM subscriptions
         WHERE user_id = $1 
           AND status = 'active'
           AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return res.json({
          success: true,
          data: null
        });
      }

      res.json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      logger.error('Get active subscription error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch active subscription'
      });
    }
  },

  /**
   * Cancel subscription
   * POST /api/subscriptions/:subscriptionId/cancel
   */
  cancelSubscription: async (req, res) => {
    try {
      const { subscriptionId } = req.params;
      const userId = req.user.id;

      // Verify ownership
      const subscriptionCheck = await db.query(
        'SELECT user_id, status FROM subscriptions WHERE subscription_id = $1',
        [subscriptionId]
      );

      if (subscriptionCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Subscription not found'
        });
      }

      if (subscriptionCheck.rows[0].user_id !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to cancel this subscription'
        });
      }

      // Cancel subscription
      const result = await db.query(
        `UPDATE subscriptions
         SET status = 'cancelled', 
             cancelled_at = CURRENT_TIMESTAMP,
             auto_renew = FALSE
         WHERE subscription_id = $1
         RETURNING *`,
        [subscriptionId]
      );

      logger.info('Subscription cancelled', { subscriptionId, userId });

      res.json({
        success: true,
        message: 'Subscription cancelled successfully',
        data: result.rows[0]
      });
    } catch (error) {
      logger.error('Cancel subscription error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to cancel subscription'
      });
    }
  },

  /**
   * Purchase content
   * POST /api/subscriptions/purchase
   */
  purchaseContent: async (req, res) => {
    try {
      const { contentId, amount, currency = 'USD', paymentMethod, transactionId } = req.body;
      const userId = req.user.id;

      // Check if content exists and is premium
      const contentResult = await db.query(
        'SELECT is_premium, price, title FROM content WHERE content_id = $1',
        [contentId]
      );

      if (contentResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Content not found'
        });
      }

      const content = contentResult.rows[0];

      if (!content.is_premium) {
        return res.status(400).json({
          success: false,
          message: 'This content is free'
        });
      }

      // Check if already purchased
      const existingPurchase = await db.query(
        'SELECT purchase_id FROM content_purchases WHERE user_id = $1 AND content_id = $2',
        [userId, contentId]
      );

      if (existingPurchase.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'Content already purchased'
        });
      }

      // Create purchase record
      const result = await db.query(
        `INSERT INTO content_purchases (
          user_id, content_id, amount, currency, payment_method, transaction_id
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
        [userId, contentId, amount, currency, paymentMethod, transactionId]
      );

      logger.info('Content purchased', { userId, contentId, amount });

      res.status(201).json({
        success: true,
        message: 'Content purchased successfully',
        data: result.rows[0]
      });
    } catch (error) {
      logger.error('Purchase content error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to purchase content'
      });
    }
  },

  /**
   * Get user's purchased content
   * GET /api/subscriptions/purchases
   */
  getPurchasedContent: async (req, res) => {
    try {
      const userId = req.user.id;

      const result = await db.query(
        `SELECT 
          cp.purchase_id, cp.amount, cp.currency, cp.purchased_at,
          c.content_id, c.title, c.slug, c.excerpt, c.featured_image_url
         FROM content_purchases cp
         JOIN content c ON cp.content_id = c.content_id
         WHERE cp.user_id = $1
           AND (cp.access_expires_at IS NULL OR cp.access_expires_at > NOW())
         ORDER BY cp.purchased_at DESC`,
        [userId]
      );

      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      logger.error('Get purchased content error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch purchased content'
      });
    }
  },

  /**
   * Subscribe to newsletter
   * POST /api/subscriptions/newsletter
   */
  subscribeNewsletter: async (req, res) => {
    try {
      const { frequency = 'weekly' } = req.body;
      const userId = req.user.id;

      // Get user email
      const userResult = await db.query(
        'SELECT email FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      const email = userResult.rows[0].email;

      // Subscribe or update subscription
      const result = await db.query(
        `INSERT INTO newsletter_subscriptions (user_id, email, subscribed, frequency)
         VALUES ($1, $2, TRUE, $3)
         ON CONFLICT (user_id) 
         DO UPDATE SET 
           subscribed = TRUE, 
           frequency = $3, 
           subscribed_at = CURRENT_TIMESTAMP,
           unsubscribed_at = NULL
         RETURNING *`,
        [userId, email, frequency]
      );

      logger.info('Newsletter subscription created', { userId, email });

      res.json({
        success: true,
        message: 'Successfully subscribed to newsletter',
        data: result.rows[0]
      });
    } catch (error) {
      logger.error('Newsletter subscribe error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to subscribe to newsletter'
      });
    }
  },

  /**
   * Unsubscribe from newsletter
   * POST /api/subscriptions/newsletter/unsubscribe
   */
  unsubscribeNewsletter: async (req, res) => {
    try {
      const userId = req.user.id;

      await db.query(
        `UPDATE newsletter_subscriptions
         SET subscribed = FALSE, unsubscribed_at = CURRENT_TIMESTAMP
         WHERE user_id = $1`,
        [userId]
      );

      logger.info('Newsletter unsubscribed', { userId });

      res.json({
        success: true,
        message: 'Successfully unsubscribed from newsletter'
      });
    } catch (error) {
      logger.error('Newsletter unsubscribe error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to unsubscribe from newsletter'
      });
    }
  }
};

module.exports = subscriptionController;

