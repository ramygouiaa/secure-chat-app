/**
 * Signaling service for WebSocket communication
 * Follows Single Responsibility Principle
 */

import { ICommunicationService } from '../../core/interfaces.js';
import { appConfig } from '../../core/config/AppConfig.js';
import { errorHandler } from '../../core/errors/ErrorHandler.js';
import { eventBus } from '../../core/events/EventBus.js';

export class SignalingService extends ICommunicationService {
  constructor() {
    super();
    this.socket = null;
    this.config = appConfig.get('websocket');
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectTimeout = null;
  }
  
  async initialize() {
    try {
      await this.connect();
      this.setupEventHandlers();
      console.log('Signaling service initialized');
    } catch (error) {
      errorHandler.createNetworkError('Failed to initialize signaling service', { error });
      throw error;
    }
  }
  
  async destroy() {
    this.clearReconnectTimeout();
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.isConnected = false;
  }
  
  async connect() {
    return new Promise((resolve, reject) => {
      try {
        const wsUrl = `${this.config.protocol}//${this.config.host}`;
        this.socket = new WebSocket(wsUrl);
        
        this.socket.onopen = () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          console.log('Connected to signaling server');
          eventBus.emit('signaling:connected');
          resolve();
        };
        
        this.socket.onclose = (event) => {
          this.isConnected = false;
          console.log('Disconnected from signaling server', event);
          eventBus.emit('signaling:disconnected', event);
          
          if (!event.wasClean) {
            this.handleReconnect();
          }
        };
        
        this.socket.onerror = (error) => {
          console.error('WebSocket error:', error);
          eventBus.emit('signaling:error', error);
          errorHandler.createNetworkError('WebSocket connection error', { error });
          reject(error);
        };
        
        this.socket.onmessage = (event) => {
          this.handleMessage(event);
        };
        
      } catch (error) {
        errorHandler.createNetworkError('Failed to create WebSocket connection', { error });
        reject(error);
      }
    });
  }
  
  async disconnect() {
    this.clearReconnectTimeout();
    if (this.socket) {
      this.socket.close(1000, 'Manual disconnect');
    }
  }
  
  async sendMessage(message) {
    if (!this.isConnected || !this.socket) {
      throw new Error('Not connected to signaling server');
    }
    
    try {
      const messageStr = JSON.stringify(message);
      this.socket.send(messageStr);
      return true;
    } catch (error) {
      errorHandler.createNetworkError('Failed to send message', { error, message });
      throw error;
    }
  }
  
  handleMessage(event) {
    try {
      const message = JSON.parse(event.data);
      
      // Emit specific events based on message type
      switch (message.type) {
        case 'init':
          eventBus.emit('signaling:init', message);
          break;
        case 'peer-list':
          eventBus.emit('signaling:peer-list', message);
          break;
        case 'offer':
          eventBus.emit('signaling:offer', message);
          break;
        case 'answer':
          eventBus.emit('signaling:answer', message);
          break;
        case 'ice-candidate':
          eventBus.emit('signaling:ice-candidate', message);
          break;
        case 'relay':
          eventBus.emit('signaling:relay', message);
          break;
        case 'relay-key-exchange':
          eventBus.emit('signaling:relay-key-exchange', message);
          break;
        case 'relay-key-exchange-ack':
          eventBus.emit('signaling:relay-key-exchange-ack', message);
          break;
        case 'video-offer':
        case 'voice-offer':
          eventBus.emit('signaling:call-offer', message);
          break;
        case 'video-answer':
        case 'voice-answer':
          eventBus.emit('signaling:call-answer', message);
          break;
        case 'hang-up':
          eventBus.emit('signaling:hang-up', message);
          break;
        case 'decline-call':
          eventBus.emit('signaling:decline-call', message);
          break;
        case 'message-status':
          eventBus.emit('signaling:message-status', message);
          break;
        case 'server-shutdown':
          eventBus.emit('signaling:server-shutdown', message);
          break;
        default:
          eventBus.emit('signaling:message', message);
      }
      
      // General message event
      eventBus.emit('signaling:message-received', message);
      
    } catch (error) {
      errorHandler.handleError(error, 'PARSING_ERROR', { rawMessage: event.data });
    }
  }
  
  handleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      eventBus.emit('signaling:reconnect-failed');
      return;
    }
    
    this.reconnectAttempts++;
    console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    this.reconnectTimeout = setTimeout(() => {
      this.connect().catch(error => {
        console.error('Reconnection failed:', error);
        this.handleReconnect();
      });
    }, this.config.reconnectDelay);
  }
  
  clearReconnectTimeout() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }
  
  setupEventHandlers() {
    // Setup heartbeat
    if (this.config.heartbeatInterval) {
      this.heartbeatInterval = setInterval(() => {
        if (this.isConnected && this.socket) {
          this.socket.send(JSON.stringify({ type: 'ping' }));
        }
      }, this.config.heartbeatInterval);
    }
  }
  
  // Utility methods
  getConnectionState() {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      readyState: this.socket ? this.socket.readyState : WebSocket.CLOSED,
    };
  }
  
  // Specialized signaling methods
  async register(name) {
    return this.sendMessage({ type: 'register', name });
  }
  
  async updateStatus(status) {
    return this.sendMessage({ type: 'status-update', status });
  }
  
  async sendOffer(offer, publicKey, targetId) {
    return this.sendMessage({
      type: 'offer',
      data: offer,
      publicKey,
      target: targetId,
    });
  }
  
  async sendAnswer(answer, publicKey, targetId) {
    return this.sendMessage({
      type: 'answer',
      data: answer,
      publicKey,
      target: targetId,
    });
  }
  
  async sendIceCandidate(candidate, targetId) {
    return this.sendMessage({
      type: 'ice-candidate',
      data: candidate,
      target: targetId,
    });
  }
  
  async sendRelayMessage(payload, targetId) {
    return this.sendMessage({
      type: 'relay',
      target: targetId,
      payload,
    });
  }
  
  async sendRelayKeyExchange(publicKey, targetId) {
    return this.sendMessage({
      type: 'relay-key-exchange',
      publicKey,
      target: targetId,
    });
  }
  
  async sendRelayKeyExchangeAck(publicKey, targetId) {
    return this.sendMessage({
      type: 'relay-key-exchange-ack',
      publicKey,
      target: targetId,
    });
  }
  
  async sendCallOffer(offer, targetId, isVideo = false) {
    return this.sendMessage({
      type: isVideo ? 'video-offer' : 'voice-offer',
      data: offer,
      target: targetId,
    });
  }
  
  async sendCallAnswer(answer, targetId, isVideo = false) {
    return this.sendMessage({
      type: isVideo ? 'video-answer' : 'voice-answer',
      data: answer,
      target: targetId,
    });
  }
  
  async sendHangUp(targetId) {
    return this.sendMessage({
      type: 'hang-up',
      target: targetId,
    });
  }
  
  async sendDeclineCall(targetId) {
    return this.sendMessage({
      type: 'decline-call',
      target: targetId,
    });
  }
  
  async sendMessageStatus(status, messageIds, targetId) {
    return this.sendMessage({
      type: 'message-status',
      status,
      messageIds,
      target: targetId,
    });
  }
}