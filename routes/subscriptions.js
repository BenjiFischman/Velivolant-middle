const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const { requireAuth } = require('../authMiddleware');
const { requireEmailVerification } = require('../middleware/roleMiddleware');

/**
 * All subscription routes require authentication
 */
router.use(requireAuth);
router.use(requireEmailVerification);

/**
 * Subscription management
 */

// Create a new subscription
router.post('/', subscriptionController.createSubscription);

// Get user's subscriptions
router.get('/', subscriptionController.getSubscriptions);

// Get active subscription
router.get('/active', subscriptionController.getActiveSubscription);

// Cancel subscription
router.post('/:subscriptionId/cancel', subscriptionController.cancelSubscription);

/**
 * Content purchases
 */

// Purchase content
router.post('/purchase', subscriptionController.purchaseContent);

// Get purchased content
router.get('/purchases', subscriptionController.getPurchasedContent);

/**
 * Newsletter subscriptions
 */

// Subscribe to newsletter
router.post('/newsletter', subscriptionController.subscribeNewsletter);

// Unsubscribe from newsletter
router.post('/newsletter/unsubscribe', subscriptionController.unsubscribeNewsletter);

module.exports = router;

