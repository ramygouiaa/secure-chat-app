/**
 * Core interfaces for the secure chat application
 * Following Interface Segregation Principle
 */

// Base interface for all services
export class IService {
  async initialize() {
    throw new Error('Method initialize must be implemented');
  }
  
  async destroy() {
    throw new Error('Method destroy must be implemented');
  }
}

// Communication interface
export class ICommunicationService extends IService {
  async connect(target) {
    throw new Error('Method connect must be implemented');
  }
  
  async disconnect() {
    throw new Error('Method disconnect must be implemented');
  }
  
  async sendMessage(message) {
    throw new Error('Method sendMessage must be implemented');
  }
}

// Encryption interface
export class IEncryptionService extends IService {
  async generateKeys() {
    throw new Error('Method generateKeys must be implemented');
  }
  
  async encryptMessage(data, targetId) {
    throw new Error('Method encryptMessage must be implemented');
  }
  
  async decryptMessage(data, senderId) {
    throw new Error('Method decryptMessage must be implemented');
  }
}

// Storage interface
export class IStorageService extends IService {
  async save(key, data) {
    throw new Error('Method save must be implemented');
  }
  
  async load(key) {
    throw new Error('Method load must be implemented');
  }
  
  async remove(key) {
    throw new Error('Method remove must be implemented');
  }
}

// UI interface
export class IUIController {
  async render(data) {
    throw new Error('Method render must be implemented');
  }
  
  async handleEvent(event) {
    throw new Error('Method handleEvent must be implemented');
  }
}

// State management interface
export class IStateManager {
  getState() {
    throw new Error('Method getState must be implemented');
  }
  
  setState(newState) {
    throw new Error('Method setState must be implemented');
  }
  
  subscribe(listener) {
    throw new Error('Method subscribe must be implemented');
  }
  
  unsubscribe(listener) {
    throw new Error('Method unsubscribe must be implemented');
  }
}

// Event system interface
export class IEventBus {
  emit(event, data) {
    throw new Error('Method emit must be implemented');
  }
  
  on(event, handler) {
    throw new Error('Method on must be implemented');
  }
  
  off(event, handler) {
    throw new Error('Method off must be implemented');
  }
}