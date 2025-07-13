/**
 * Storage service for persisting chat data
 * Follows Single Responsibility Principle
 */

import { IStorageService } from '../../core/interfaces.js';
import { appConfig } from '../../core/config/AppConfig.js';
import { errorHandler } from '../../core/errors/ErrorHandler.js';

export class StorageService extends IStorageService {
  constructor() {
    super();
    this.config = appConfig.get('storage');
    this.prefix = this.config.prefix;
  }
  
  async initialize() {
    // Check if storage is available
    if (!this.isStorageAvailable()) {
      throw new Error('Storage is not available');
    }
    console.log('Storage service initialized');
  }
  
  async destroy() {
    // Clear all app-specific data
    this.clearAll();
  }
  
  isStorageAvailable() {
    try {
      const test = '__storage_test__';
      sessionStorage.setItem(test, test);
      sessionStorage.removeItem(test);
      return true;
    } catch (error) {
      return false;
    }
  }
  
  getKey(key) {
    return `${this.prefix}${key}`;
  }
  
  async save(key, data) {
    try {
      const fullKey = this.getKey(key);
      const serializedData = JSON.stringify(data);
      sessionStorage.setItem(fullKey, serializedData);
      return true;
    } catch (error) {
      errorHandler.handleError(error, 'STORAGE_ERROR', { key, operation: 'save' });
      throw error;
    }
  }
  
  async load(key) {
    try {
      const fullKey = this.getKey(key);
      const serializedData = sessionStorage.getItem(fullKey);
      
      if (serializedData === null) {
        return null;
      }
      
      return JSON.parse(serializedData);
    } catch (error) {
      errorHandler.handleError(error, 'STORAGE_ERROR', { key, operation: 'load' });
      throw error;
    }
  }
  
  async remove(key) {
    try {
      const fullKey = this.getKey(key);
      sessionStorage.removeItem(fullKey);
      return true;
    } catch (error) {
      errorHandler.handleError(error, 'STORAGE_ERROR', { key, operation: 'remove' });
      throw error;
    }
  }
  
  async exists(key) {
    try {
      const fullKey = this.getKey(key);
      return sessionStorage.getItem(fullKey) !== null;
    } catch (error) {
      errorHandler.handleError(error, 'STORAGE_ERROR', { key, operation: 'exists' });
      return false;
    }
  }
  
  async clear() {
    try {
      sessionStorage.clear();
      return true;
    } catch (error) {
      errorHandler.handleError(error, 'STORAGE_ERROR', { operation: 'clear' });
      throw error;
    }
  }
  
  async clearAll() {
    try {
      const keys = Object.keys(sessionStorage);
      const appKeys = keys.filter(key => key.startsWith(this.prefix));
      
      appKeys.forEach(key => {
        sessionStorage.removeItem(key);
      });
      
      return true;
    } catch (error) {
      errorHandler.handleError(error, 'STORAGE_ERROR', { operation: 'clearAll' });
      throw error;
    }
  }
  
  async getAll() {
    try {
      const keys = Object.keys(sessionStorage);
      const appKeys = keys.filter(key => key.startsWith(this.prefix));
      const result = {};
      
      appKeys.forEach(key => {
        const appKey = key.slice(this.prefix.length);
        try {
          result[appKey] = JSON.parse(sessionStorage.getItem(key));
        } catch (error) {
          console.warn(`Failed to parse stored data for key: ${key}`);
        }
      });
      
      return result;
    } catch (error) {
      errorHandler.handleError(error, 'STORAGE_ERROR', { operation: 'getAll' });
      throw error;
    }
  }
  
  // Specialized methods for chat data
  async saveDiscussion(peerId, discussion) {
    const key = `${this.config.discussionKey}${peerId}`;
    return this.save(key, discussion);
  }
  
  async loadDiscussion(peerId) {
    const key = `${this.config.discussionKey}${peerId}`;
    const discussion = await this.load(key);
    return discussion || { messages: [], calls: [] };
  }
  
  async removeDiscussion(peerId) {
    const key = `${this.config.discussionKey}${peerId}`;
    return this.remove(key);
  }
  
  async saveUserData(userData) {
    const key = this.config.userKey;
    return this.save(key, userData);
  }
  
  async loadUserData() {
    const key = this.config.userKey;
    return this.load(key);
  }
  
  async removeUserData() {
    const key = this.config.userKey;
    return this.remove(key);
  }
  
  // Utility methods
  getStorageSize() {
    let size = 0;
    const keys = Object.keys(sessionStorage);
    
    keys.forEach(key => {
      if (key.startsWith(this.prefix)) {
        size += sessionStorage.getItem(key).length;
      }
    });
    
    return size;
  }
  
  getStorageInfo() {
    const keys = Object.keys(sessionStorage);
    const appKeys = keys.filter(key => key.startsWith(this.prefix));
    
    return {
      totalKeys: appKeys.length,
      totalSize: this.getStorageSize(),
      keys: appKeys.map(key => ({
        key: key.slice(this.prefix.length),
        size: sessionStorage.getItem(key).length,
      })),
    };
  }
}