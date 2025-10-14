const { Kafka } = require('kafkajs');
const { SchemaRegistry } = require('@kafkajs/confluent-schema-registry');
const logger = require('../logger/winstonConfig');

class KafkaProducer {
  constructor() {
    this.kafka = new Kafka({
      clientId: 'velivolant-middle-producer',
      brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
      ssl: process.env.KAFKA_SSL === 'true',
      sasl: process.env.KAFKA_SASL_ENABLED === 'true' ? {
        mechanism: 'plain',
        username: process.env.KAFKA_API_KEY,
        password: process.env.KAFKA_API_SECRET,
      } : undefined,
    });

    this.producer = this.kafka.producer({
      idempotent: true,
      maxInFlightRequests: 5,
      transactionalId: 'velivolant-producer',
    });

    this.registry = new SchemaRegistry({
      host: process.env.SCHEMA_REGISTRY_URL || 'http://localhost:8081',
      auth: process.env.SCHEMA_REGISTRY_KEY ? {
        username: process.env.SCHEMA_REGISTRY_KEY,
        password: process.env.SCHEMA_REGISTRY_SECRET,
      } : undefined,
    });

    this.connected = false;
    this.requestSchema = null;
  }

  async connect() {
    if (this.connected) return;

    try {
      await this.producer.connect();
      
      // Register or get request schema
      this.requestSchema = await this.registry.getLatestSchemaId(
        'velivolant.event-requests.v1-value'
      );

      this.connected = true;
      logger.info('Kafka producer connected');
    } catch (error) {
      logger.error('Failed to connect Kafka producer', { error: error.message });
      throw error;
    }
  }

  async publishRequest(request) {
    if (!this.connected) await this.connect();

    try {
      const encodedValue = await this.registry.encode(this.requestSchema, request);

      const result = await this.producer.send({
        topic: 'velivolant.event-requests.v1',
        messages: [{
          key: request.request_id,
          value: encodedValue,
          headers: {
            'correlation-id': request.correlation_id,
            'source': 'middle-api',
          },
        }],
      });

      logger.info('Published computation request', {
        requestId: request.request_id,
        type: request.request_type,
        partition: result[0].partition,
        offset: result[0].offset,
      });

      return result;
    } catch (error) {
      logger.error('Failed to publish request', {
        requestId: request.request_id,
        error: error.message,
      });
      throw error;
    }
  }

  async disconnect() {
    if (this.connected) {
      await this.producer.disconnect();
      this.connected = false;
      logger.info('Kafka producer disconnected');
    }
  }
}

// Singleton instance
const kafkaProducer = new KafkaProducer();

// Graceful shutdown
process.on('SIGTERM', async () => {
  await kafkaProducer.disconnect();
});

module.exports = kafkaProducer;

