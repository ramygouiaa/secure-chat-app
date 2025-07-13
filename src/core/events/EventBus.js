/**
 * Event Bus implementation for decoupled communication
 * Implements Observer pattern for loose coupling
 */

import { IEventBus } from '../interfaces.js';

export class EventBus extends IEventBus {
  constructor() {
    super();
    this.events = new Map();
  }
  
  emit(event, data = null) {
    const handlers = this.events.get(event);
    if (!handlers) return false;
    
    handlers.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error(`Error in event handler for ${event}:`, error);
      }
    });
    
    return true;
  }
  
  on(event, handler) {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event).add(handler);
    
    // Return unsubscribe function
    return () => this.off(event, handler);
  }
  
  off(event, handler) {
    const handlers = this.events.get(event);
    if (!handlers) return false;
    
    const removed = handlers.delete(handler);
    if (handlers.size === 0) {
      this.events.delete(event);
    }
    
    return removed;
  }
  
  once(event, handler) {
    const onceHandler = (data) => {
      handler(data);
      this.off(event, onceHandler);
    };
    
    return this.on(event, onceHandler);
  }
  
  removeAllListeners(event) {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
  }
  
  getEventNames() {
    return Array.from(this.events.keys());
  }
  
  getListenerCount(event) {
    const handlers = this.events.get(event);
    return handlers ? handlers.size : 0;
  }
}

// Singleton instance
export const eventBus = new EventBus();