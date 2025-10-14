const express = require('express');
const router = express.Router();
const computationController = require('../controllers/computationController');
const { requireAuth } = require('../authMiddleware');

// All computation routes require authentication
router.use(requireAuth);

// Submit computation request (async)
router.post('/submit', computationController.submitRequest);

// Execute and wait for result (sync)
router.post('/execute', computationController.executeRequest);

// Get result by request ID
router.get('/result/:requestId', computationController.getResult);

// Specific computation types
router.post('/bac', computationController.calculateBAC);
router.get('/analytics/:eventId', computationController.getEventAnalytics);
router.get('/leaderboard/:eventId', computationController.getLeaderboard);

// System stats
router.get('/stats', computationController.getStats);

module.exports = router;

