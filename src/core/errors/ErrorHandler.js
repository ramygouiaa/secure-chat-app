/**
 * Centralized error handling system
 * Provides consistent error handling across the application
 */

import { eventBus } from '../events/EventBus.js';
import { appConfig } from '../config/AppConfig.js';

export class ErrorHandler {
  constructor() {
    this.errorTypes = {
      NETWORK_ERROR: 'NETWORK_ERROR',
      WEBRTC_ERROR: 'WEBRTC_ERROR',
      ENCRYPTION_ERROR: 'ENCRYPTION_ERROR',
      VALIDATION_ERROR: 'VALIDATION_ERROR',
      USER_ERROR: 'USER_ERROR',
      SYSTEM_ERROR: 'SYSTEM_ERROR',
    };
    
    this.errorQueue = [];
    this.maxErrorQueueSize = 100;
    
    // Set up global error handlers
    this.setupGlobalErrorHandlers();
  }
  
  setupGlobalErrorHandlers() {
    // Handle uncaught errors
    window.addEventListener('error', (event) => {
      this.handleError(event.error, this.errorTypes.SYSTEM_ERROR);
    });
    
    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.handleError(event.reason, this.errorTypes.SYSTEM_ERROR);
    });
  }
  
  handleError(error, type = this.errorTypes.SYSTEM_ERROR, context = {}) {
    const errorInfo = {
      message: error.message || 'Unknown error',
      stack: error.stack,
      type,
      context,
      timestamp: Date.now(),
      id: this.generateErrorId(),
    };
    
    // Add to error queue
    this.errorQueue.push(errorInfo);
    if (this.errorQueue.length > this.maxErrorQueueSize) {
      this.errorQueue.shift();
    }
    
    // Log error
    this.logError(errorInfo);
    
    // Emit error event
    eventBus.emit('error:occurred', errorInfo);
    
    // Handle specific error types
    this.handleSpecificError(errorInfo);
    
    return errorInfo.id;
  }
  
  handleSpecificError(errorInfo) {
    switch (errorInfo.type) {
      case this.errorTypes.NETWORK_ERROR:
        this.handleNetworkError(errorInfo);
        break;
      case this.errorTypes.WEBRTC_ERROR:
        this.handleWebRTCError(errorInfo);
        break;
      case this.errorTypes.ENCRYPTION_ERROR:
        this.handleEncryptionError(errorInfo);
        break;
      case this.errorTypes.VALIDATION_ERROR:
        this.handleValidationError(errorInfo);
        break;
      case this.errorTypes.USER_ERROR:
        this.handleUserError(errorInfo);
        break;
      default:
        this.handleSystemError(errorInfo);
    }
  }
  
  handleNetworkError(errorInfo) {
    eventBus.emit('notification:show', {
      message: 'Network connection issue. Please check your connection.',
      type: 'error',
    });
  }
  
  handleWebRTCError(errorInfo) {
    eventBus.emit('notification:show', {
      message: 'Connection issue. Trying to reconnect...',
      type: 'warning',
    });
    
    // Trigger fallback mechanism
    eventBus.emit('webrtc:fallback', errorInfo);
  }
  
  handleEncryptionError(errorInfo) {
    eventBus.emit('notification:show', {
      message: 'Encryption error. Please restart the chat.',
      type: 'error',
    });
  }
  
  handleValidationError(errorInfo) {
    eventBus.emit('notification:show', {
      message: errorInfo.message,
      type: 'warning',
    });
  }
  
  handleUserError(errorInfo) {
    eventBus.emit('notification:show', {
      message: errorInfo.message,
      type: 'info',
    });
  }
  
  handleSystemError(errorInfo) {
    if (appConfig.isDevelopment()) {
      console.error('System error:', errorInfo);
    }
    
    eventBus.emit('notification:show', {
      message: 'An unexpected error occurred. Please try again.',
      type: 'error',
    });
  }
  
  logError(errorInfo) {
    if (appConfig.get('development.enableDebugLogs')) {
      console.error(`[${errorInfo.type}] ${errorInfo.message}`, errorInfo);
    }
    
    // In production, you might want to send errors to a logging service
    if (appConfig.isProduction()) {
      // Send to logging service
      this.sendToLoggingService(errorInfo);
    }
  }
  
  sendToLoggingService(errorInfo) {
    // Implement your logging service integration here
    // For example: send to Sentry, LogRocket, etc.
  }
  
  generateErrorId() {
    return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  getErrorQueue() {
    return [...this.errorQueue];
  }
  
  clearErrorQueue() {
    this.errorQueue = [];
  }
  
  getErrorById(id) {
    return this.errorQueue.find(error => error.id === id);
  }
  
  // Utility methods for specific error types
  createNetworkError(message, context = {}) {
    return this.handleError(new Error(message), this.errorTypes.NETWORK_ERROR, context);
  }
  
  createWebRTCError(message, context = {}) {
    return this.handleError(new Error(message), this.errorTypes.WEBRTC_ERROR, context);
  }
  
  createEncryptionError(message, context = {}) {
    return this.handleError(new Error(message), this.errorTypes.ENCRYPTION_ERROR, context);
  }
  
  createValidationError(message, context = {}) {
    return this.handleError(new Error(message), this.errorTypes.VALIDATION_ERROR, context);
  }
  
  createUserError(message, context = {}) {
    return this.handleError(new Error(message), this.errorTypes.USER_ERROR, context);
  }
}

// Singleton instance
export const errorHandler = new ErrorHandler();