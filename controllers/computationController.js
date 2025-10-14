const feeder = require('../kafka/feeder');
const logger = require('../logger/winstonConfig');
const db = require('../db/postgres');

const computationController = {
  /**
   * Submit computation request
   * POST /api/compute/submit
   */
  submitRequest: async (req, res) => {
    try {
      const { type, payload, userId, eventId } = req.body;

      if (!type || !payload) {
        return res.status(400).json({
          success: false,
          message: 'Type and payload are required',
        });
      }

      const result = await feeder.submitRequest(type, payload, {
        userId,
        eventId,
      });

      res.status(202).json({
        success: true,
        message: 'Computation request submitted',
        data: result,
      });
    } catch (error) {
      logger.error('Submit request error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to submit request',
      });
    }
  },

  /**
   * Submit and wait for result
   * POST /api/compute/execute
   */
  executeRequest: async (req, res) => {
    try {
      const { type, payload, userId, eventId, timeout } = req.body;

      if (!type || !payload) {
        return res.status(400).json({
          success: false,
          message: 'Type and payload are required',
        });
      }

      const result = await feeder.submitAndWait(type, payload, {
        userId,
        eventId,
        timeout: timeout || 30000,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      if (error.message.includes('timed out')) {
        return res.status(504).json({
          success: false,
          message: 'Computation request timed out',
        });
      }

      logger.error('Execute request error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to execute request',
      });
    }
  },

  /**
   * Get result by request ID
   * GET /api/compute/result/:requestId
   */
  getResult: async (req, res) => {
    try {
      const { requestId } = req.params;

      const result = await db.query(
        `SELECT * FROM computation_results WHERE request_id = $1`,
        [requestId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Result not found',
        });
      }

      res.json({
        success: true,
        data: result.rows[0],
      });
    } catch (error) {
      logger.error('Get result error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get result',
      });
    }
  },

  /**
   * Calculate BAC
   * POST /api/compute/bac
   */
  calculateBAC: async (req, res) => {
    try {
      const { userId, eventId, libations } = req.body;

      const result = await feeder.submitAndWait('BAC_CALCULATION', {
        user_id: userId,
        event_id: eventId,
        libations,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Calculate BAC error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to calculate BAC',
      });
    }
  },

  /**
   * Get event analytics
   * GET /api/compute/analytics/:eventId
   */
  getEventAnalytics: async (req, res) => {
    try {
      const { eventId } = req.params;

      const result = await feeder.submitAndWait('EVENT_ANALYTICS', {
        event_id: parseInt(eventId),
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Get analytics error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get analytics',
      });
    }
  },

  /**
   * Generate leaderboard
   * GET /api/compute/leaderboard/:eventId
   */
  getLeaderboard: async (req, res) => {
    try {
      const { eventId } = req.params;
      const { limit, metric } = req.query;

      const result = await feeder.submitAndWait('LEADERBOARD', {
        event_id: parseInt(eventId),
        limit: limit ? parseInt(limit) : 100,
        metric: metric || 'bac',
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Get leaderboard error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get leaderboard',
      });
    }
  },

  /**
   * Get system stats
   * GET /api/compute/stats
   */
  getStats: async (req, res) => {
    try {
      const pendingCount = feeder.getPendingCount();

      const recentResults = await db.query(
        `SELECT status, COUNT(*) as count 
         FROM computation_results 
         WHERE computed_at > NOW() - INTERVAL '1 hour'
         GROUP BY status`
      );

      res.json({
        success: true,
        data: {
          pendingRequests: pendingCount,
          recentResults: recentResults.rows,
        },
      });
    } catch (error) {
      logger.error('Get stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get stats',
      });
    }
  },
};

module.exports = computationController;

