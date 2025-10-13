const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const logger = require('../logger/winstonConfig');
const db = require('../db/postgres');

class WebSocketServer {
  constructor(server) {
    this.wss = new WebSocket.Server({ 
      server,
      path: '/ws'
    });
    
    this.clients = new Map(); // userId -> Set of WebSocket connections
    this.eventSubscriptions = new Map(); // eventId -> Set of WebSocket connections

    this.wss.on('connection', this.handleConnection.bind(this));
    
    logger.info('WebSocket server initialized');
  }

  handleConnection(ws, req) {
    logger.info('New WebSocket connection');

    ws.isAlive = true;
    ws.userId = null;
    ws.subscribedEvents = new Set();

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (message) => {
      this.handleMessage(ws, message);
    });

    ws.on('close', () => {
      this.handleDisconnect(ws);
    });

    ws.on('error', (error) => {
      logger.error('WebSocket error', { error: error.message });
    });

    // Send welcome message
    this.send(ws, {
      type: 'connected',
      message: 'WebSocket connection established',
    });
  }

  async handleMessage(ws, message) {
    try {
      const data = JSON.parse(message.toString());

      switch (data.type) {
        case 'authenticate':
          await this.handleAuthenticate(ws, data);
          break;

        case 'subscribe_event':
          await this.handleSubscribeEvent(ws, data);
          break;

        case 'unsubscribe_event':
          await this.handleUnsubscribeEvent(ws, data);
          break;

        case 'ping':
          this.send(ws, { type: 'pong', timestamp: Date.now() });
          break;

        default:
          this.send(ws, {
            type: 'error',
            message: `Unknown message type: ${data.type}`,
          });
      }
    } catch (error) {
      logger.error('Error handling WebSocket message', { error: error.message });
      this.send(ws, {
        type: 'error',
        message: 'Invalid message format',
      });
    }
  }

  async handleAuthenticate(ws, data) {
    try {
      const { token } = data;

      if (!token) {
        return this.send(ws, {
          type: 'auth_error',
          message: 'Token required',
        });
      }

      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      ws.userId = decoded.id;
      ws.userEmail = decoded.email;

      // Add to clients map
      if (!this.clients.has(ws.userId)) {
        this.clients.set(ws.userId, new Set());
      }
      this.clients.get(ws.userId).add(ws);

      logger.info('WebSocket authenticated', { userId: ws.userId });

      this.send(ws, {
        type: 'authenticated',
        userId: ws.userId,
        email: ws.userEmail,
      });
    } catch (error) {
      logger.error('WebSocket authentication failed', { error: error.message });
      this.send(ws, {
        type: 'auth_error',
        message: 'Invalid token',
      });
    }
  }

  async handleSubscribeEvent(ws, data) {
    if (!ws.userId) {
      return this.send(ws, {
        type: 'error',
        message: 'Authentication required',
      });
    }

    const { eventId } = data;

    if (!eventId) {
      return this.send(ws, {
        type: 'error',
        message: 'Event ID required',
      });
    }

    // Add to event subscriptions
    if (!this.eventSubscriptions.has(eventId)) {
      this.eventSubscriptions.set(eventId, new Set());
    }
    this.eventSubscriptions.get(eventId).add(ws);
    ws.subscribedEvents.add(eventId);

    logger.info('WebSocket subscribed to event', { 
      userId: ws.userId, 
      eventId 
    });

    this.send(ws, {
      type: 'subscribed',
      eventId,
    });
  }

  async handleUnsubscribeEvent(ws, data) {
    const { eventId } = data;

    if (!eventId) {
      return this.send(ws, {
        type: 'error',
        message: 'Event ID required',
      });
    }

    // Remove from event subscriptions
    if (this.eventSubscriptions.has(eventId)) {
      this.eventSubscriptions.get(eventId).delete(ws);
      if (this.eventSubscriptions.get(eventId).size === 0) {
        this.eventSubscriptions.delete(eventId);
      }
    }
    ws.subscribedEvents.delete(eventId);

    logger.info('WebSocket unsubscribed from event', { 
      userId: ws.userId, 
      eventId 
    });

    this.send(ws, {
      type: 'unsubscribed',
      eventId,
    });
  }

  handleDisconnect(ws) {
    // Remove from clients map
    if (ws.userId && this.clients.has(ws.userId)) {
      this.clients.get(ws.userId).delete(ws);
      if (this.clients.get(ws.userId).size === 0) {
        this.clients.delete(ws.userId);
      }
    }

    // Remove from event subscriptions
    ws.subscribedEvents.forEach(eventId => {
      if (this.eventSubscriptions.has(eventId)) {
        this.eventSubscriptions.get(eventId).delete(ws);
        if (this.eventSubscriptions.get(eventId).size === 0) {
          this.eventSubscriptions.delete(eventId);
        }
      }
    });

    logger.info('WebSocket disconnected', { userId: ws.userId });
  }

  send(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  // Broadcast to specific user (all their connections)
  broadcastToUser(userId, data) {
    if (this.clients.has(userId)) {
      this.clients.get(userId).forEach(ws => {
        this.send(ws, data);
      });
    }
  }

  // Broadcast to all subscribers of an event
  broadcastToEvent(eventId, data) {
    if (this.eventSubscriptions.has(eventId)) {
      this.eventSubscriptions.get(eventId).forEach(ws => {
        this.send(ws, data);
      });
    }
  }

  // Broadcast to all connected clients
  broadcast(data) {
    this.wss.clients.forEach(ws => {
      this.send(ws, data);
    });
  }

  // Notify about new libation score
  notifyLibationUpdate(libation) {
    const data = {
      type: 'libation_update',
      libation: {
        id: libation.id,
        userId: libation.user_id,
        eventId: libation.event_id,
        bac: libation.bac,
        timestamp: libation.timestamp,
      },
    };

    // Notify event subscribers
    this.broadcastToEvent(libation.event_id, data);

    // Notify the user
    this.broadcastToUser(libation.user_id, data);
  }

  // Notify about event updates
  notifyEventUpdate(event, updateType = 'UPDATE') {
    const data = {
      type: 'event_update',
      updateType,
      event: {
        eventId: event.event_id,
        name: event.name,
        description: event.description,
        startTime: event.start_time,
        endTime: event.end_time,
        location: event.location,
        status: event.status,
      },
    };

    // Notify event subscribers
    this.broadcastToEvent(event.event_id, data);
  }

  // Start heartbeat to detect dead connections
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach(ws => {
        if (ws.isAlive === false) {
          logger.info('Terminating dead WebSocket connection');
          return ws.terminate();
        }

        ws.isAlive = false;
        ws.ping();
      });
    }, 30000); // Check every 30 seconds
  }

  // Stop heartbeat
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
  }

  // Shutdown
  shutdown() {
    this.stopHeartbeat();
    
    this.wss.clients.forEach(ws => {
      this.send(ws, {
        type: 'server_shutdown',
        message: 'Server is shutting down',
      });
      ws.close();
    });

    this.wss.close(() => {
      logger.info('WebSocket server closed');
    });
  }
}

module.exports = WebSocketServer;

