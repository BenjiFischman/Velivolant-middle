const { Kafka } = require('kafkajs');
const { SchemaRegistry } = require('@kafkajs/confluent-schema-registry');
const logger = require('../logger/winstonConfig');
const db = require('../db/postgres');

class ResultsConsumer {
  constructor() {
    this.kafka = new Kafka({
      clientId: 'velivolant-middle-consumer',
      brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
      ssl: process.env.KAFKA_SSL === 'true',
      sasl: process.env.KAFKA_SASL_ENABLED === 'true' ? {
        mechanism: 'plain',
        username: process.env.KAFKA_API_KEY,
        password: process.env.KAFKA_API_SECRET,
      } : undefined,
    });

    this.consumer = this.kafka.consumer({
      groupId: 'velivolant-middle-results',
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });

    this.registry = new SchemaRegistry({
      host: process.env.SCHEMA_REGISTRY_URL || 'http://localhost:8081',
      auth: process.env.SCHEMA_REGISTRY_KEY ? {
        username: process.env.SCHEMA_REGISTRY_KEY,
        password: process.env.SCHEMA_REGISTRY_SECRET,
      } : undefined,
    });

    this.resultHandlers = new Map();
    this.running = false;
  }

  async connect() {
    if (this.running) return;

    try {
      await this.consumer.connect();
      await this.consumer.subscribe({
        topics: ['velivolant.computation-results.v1'],
        fromBeginning: false,
      });

      logger.info('Results consumer connected and subscribed');
      this.running = true;
    } catch (error) {
      logger.error('Failed to connect results consumer', { error: error.message });
      throw error;
    }
  }

  async start() {
    await this.connect();

    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const decodedValue = await this.registry.decode(message.value);
          
          logger.info('Received computation result', {
            requestId: decodedValue.request_id,
            correlationId: decodedValue.correlation_id,
            status: decodedValue.status,
            processingTime: decodedValue.processing_time_ms,
          });

          await this.handleResult(decodedValue);
        } catch (error) {
          logger.error('Error processing result message', {
            error: error.message,
            offset: message.offset,
          });
        }
      },
    });
  }

  async handleResult(result) {
    const {
      request_id,
      correlation_id,
      status,
      result: resultData,
      computed_at,
      processing_time_ms,
      error_message,
    } = result;

    try {
      // Store result in database
      await db.query(
        `INSERT INTO computation_results (
          request_id, correlation_id, status, result_data,
          computed_at, processing_time_ms, error_message
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (request_id) DO UPDATE
        SET status = $2, result_data = $4, computed_at = $5,
            processing_time_ms = $6, error_message = $7`,
        [
          request_id,
          status,
          resultData,
          new Date(computed_at),
          processing_time_ms,
          error_message,
        ]
      );

      // Call registered handler if exists
      const handler = this.resultHandlers.get(correlation_id);
      if (handler) {
        await handler(result);
        this.resultHandlers.delete(correlation_id);
      }

      // Notify via WebSocket if applicable
      if (global.wsServer) {
        global.wsServer.broadcast({
          type: 'computation_result',
          requestId: request_id,
          correlationId: correlation_id,
          status,
          result: resultData,
        });
      }

      logger.info('Result processed successfully', { requestId: request_id });
    } catch (error) {
      logger.error('Failed to handle result', {
        requestId: request_id,
        error: error.message,
      });
    }
  }

  // Register callback for specific correlation ID
  registerHandler(correlationId, handler) {
    this.resultHandlers.set(correlationId, handler);
    
    // Auto-cleanup after 5 minutes
    setTimeout(() => {
      this.resultHandlers.delete(correlationId);
    }, 5 * 60 * 1000);
  }

  async disconnect() {
    if (this.running) {
      await this.consumer.disconnect();
      this.running = false;
      logger.info('Results consumer disconnected');
    }
  }
}

// Singleton instance
const resultsConsumer = new ResultsConsumer();

// Graceful shutdown
process.on('SIGTERM', async () => {
  await resultsConsumer.disconnect();
});

module.exports = resultsConsumer;

