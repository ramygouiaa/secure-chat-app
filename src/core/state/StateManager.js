/**
 * Centralized state management system
 * Implements Redux-like pattern for predictable state updates
 */

import { IStateManager } from '../interfaces.js';
import { eventBus } from '../events/EventBus.js';

export class StateManager extends IStateManager {
  constructor(initialState = {}) {
    super();
    this.state = { ...initialState };
    this.subscribers = new Set();
    this.history = [];
    this.maxHistorySize = 50;
  }
  
  getState() {
    return { ...this.state };
  }
  
  setState(newState, action = 'SET_STATE') {
    const prevState = { ...this.state };
    
    // Merge new state with existing state
    this.state = { ...this.state, ...newState };
    
    // Add to history
    this.history.push({
      action,
      prevState,
      newState: { ...this.state },
      timestamp: Date.now(),
    });
    
    // Limit history size
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
    
    // Notify subscribers
    this.notifySubscribers();
    
    // Emit state change event
    eventBus.emit('state:changed', {
      prevState,
      newState: { ...this.state },
      action,
    });
  }
  
  subscribe(listener) {
    this.subscribers.add(listener);
    
    // Return unsubscribe function
    return () => this.unsubscribe(listener);
  }
  
  unsubscribe(listener) {
    return this.subscribers.delete(listener);
  }
  
  notifySubscribers() {
    this.subscribers.forEach(listener => {
      try {
        listener(this.getState());
      } catch (error) {
        console.error('Error in state subscriber:', error);
      }
    });
  }
  
  // Action dispatchers for common operations
  dispatch(action, payload) {
    switch (action) {
      case 'SET_USER':
        this.setState({ user: payload }, action);
        break;
      case 'SET_CURRENT_CHAT':
        this.setState({ currentChat: payload }, action);
        break;
      case 'ADD_PEER':
        this.setState({ 
          peers: { ...this.state.peers, [payload.id]: payload } 
        }, action);
        break;
      case 'REMOVE_PEER':
        const newPeers = { ...this.state.peers };
        delete newPeers[payload];
        this.setState({ peers: newPeers }, action);
        break;
      case 'UPDATE_CONNECTION_STATUS':
        this.setState({ connectionStatus: payload }, action);
        break;
      case 'SET_CALL_STATE':
        this.setState({ callState: payload }, action);
        break;
      case 'ADD_MESSAGE':
        const discussions = { ...this.state.discussions };
        const chatId = payload.chatId;
        if (!discussions[chatId]) {
          discussions[chatId] = { messages: [], calls: [] };
        }
        discussions[chatId].messages.push(payload.message);
        this.setState({ discussions }, action);
        break;
      case 'ADD_CALL_RECORD':
        const discussionsWithCall = { ...this.state.discussions };
        const callChatId = payload.chatId;
        if (!discussionsWithCall[callChatId]) {
          discussionsWithCall[callChatId] = { messages: [], calls: [] };
        }
        discussionsWithCall[callChatId].calls.push(payload.call);
        this.setState({ discussions: discussionsWithCall }, action);
        break;
      default:
        console.warn(`Unknown action: ${action}`);
    }
  }
  
  // Utility methods
  getHistory() {
    return [...this.history];
  }
  
  clearHistory() {
    this.history = [];
  }
  
  reset() {
    this.state = {};
    this.history = [];
    this.notifySubscribers();
  }
}

// Create initial state
const initialState = {
  user: null,
  clientId: null,
  peers: {},
  currentChat: null,
  discussions: {},
  connectionStatus: 'disconnected',
  callState: null,
  uiState: {
    sidebarOpen: false,
    activeModal: null,
    notifications: [],
  },
  settings: {
    status: 'Online',
    forceRelay: false,
    notifications: true,
  },
};

// Singleton instance
export const stateManager = new StateManager(initialState);