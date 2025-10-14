const { v4: uuidv4 } = require('uuid');
const kafkaProducer = require('./producer');
const resultsConsumer = require('./consumer');
const logger = require('../logger/winstonConfig');

class ComputationFeeder {
  constructor() {
    this.pendingRequests = new Map();
  }

  async init() {
    try {
      await kafkaProducer.connect();
      await resultsConsumer.start();
      logger.info('Computation feeder initialized');
    } catch (error) {
      logger.error('Failed to initialize feeder', { error: error.message });
      throw error;
    }
  }

  /**
   * Submit computation request to Yazhitite
   */
  async submitRequest(requestType, payload, options = {}) {
    const requestId = uuidv4();
    const correlationId = options.correlationId || uuidv4();

    const request = {
      request_id: requestId,
      request_type: requestType,
      payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
      user_id: options.userId || null,
      event_id: options.eventId || null,
      timestamp: Date.now(),
      correlation_id: correlationId,
    };

    try {
      await kafkaProducer.publishRequest(request);

      // If callback provided, register it
      if (options.callback) {
        resultsConsumer.registerHandler(correlationId, options.callback);
      }

      // Store request metadata
      this.pendingRequests.set(requestId, {
        submittedAt: Date.now(),
        type: requestType,
        correlationId,
      });

      logger.info('Computation request submitted', {
        requestId,
        type: requestType,
        correlationId,
      });

      return {
        requestId,
        correlationId,
      };
    } catch (error) {
      logger.error('Failed to submit request', {
        requestId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Calculate BAC for user/event
   */
  async calculateBAC(userId, eventId, libations) {
    return this.submitRequest('BAC_CALCULATION', {
      user_id: userId,
      event_id: eventId,
      libations,
    }, { userId, eventId });
  }

  /**
   * Get event analytics
   */
  async getEventAnalytics(eventId) {
    return this.submitRequest('EVENT_ANALYTICS', {
      event_id: eventId,
    }, { eventId });
  }

  /**
   * Calculate user score
   */
  async calculateUserScore(userId) {
    return this.submitRequest('USER_SCORE', {
      user_id: userId,
    }, { userId });
  }

  /**
   * Generate leaderboard
   */
  async generateLeaderboard(eventId, options = {}) {
    return this.submitRequest('LEADERBOARD', {
      event_id: eventId,
      limit: options.limit || 100,
      metric: options.metric || 'bac',
    }, { eventId });
  }

  /**
   * Submit with promise-based result waiting
   */
  async submitAndWait(requestType, payload, options = {}) {
    const timeout = options.timeout || 30000; // 30 seconds default

    return new Promise(async (resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        reject(new Error('Computation request timed out'));
      }, timeout);

      try {
        const { requestId, correlationId } = await this.submitRequest(
          requestType,
          payload,
          {
            ...options,
            callback: (result) => {
              clearTimeout(timeoutHandle);
              if (result.status === 'SUCCESS') {
                resolve(JSON.parse(result.result));
              } else {
                reject(new Error(result.error_message || 'Computation failed'));
              }
            },
          }
        );
      } catch (error) {
        clearTimeout(timeoutHandle);
        reject(error);
      }
    });
  }

  /**
   * Get pending request count
   */
  getPendingCount() {
    return this.pendingRequests.size;
  }

  /**
   * Cleanup old requests
   */
  cleanup() {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minutes

    for (const [requestId, request] of this.pendingRequests.entries()) {
      if (now - request.submittedAt > maxAge) {
        this.pendingRequests.delete(requestId);
      }
    }
  }
}

// Singleton instance
const feeder = new ComputationFeeder();

// Periodic cleanup
setInterval(() => feeder.cleanup(), 60000);

module.exports = feeder;

