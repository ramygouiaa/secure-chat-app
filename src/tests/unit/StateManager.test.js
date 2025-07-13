/**
 * Unit tests for StateManager
 * Testing state management functionality
 */

import { StateManager } from '../../core/state/StateManager.js';

// Mock event bus
const mockEventBus = {
  emit: jest.fn(),
};

// Simple test runner for browser environment
class TestRunner {
  constructor() {
    this.tests = [];
    this.results = {
      passed: 0,
      failed: 0,
      total: 0,
    };
  }
  
  test(name, fn) {
    this.tests.push({ name, fn });
  }
  
  expect(actual) {
    return {
      toBe: (expected) => {
        if (actual !== expected) {
          throw new Error(`Expected ${expected}, but got ${actual}`);
        }
      },
      toEqual: (expected) => {
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          throw new Error(`Expected ${JSON.stringify(expected)}, but got ${JSON.stringify(actual)}`);
        }
      },
      toBeDefined: () => {
        if (actual === undefined) {
          throw new Error('Expected value to be defined');
        }
      },
      toBeNull: () => {
        if (actual !== null) {
          throw new Error('Expected value to be null');
        }
      },
      toContain: (item) => {
        if (!Array.isArray(actual) || !actual.includes(item)) {
          throw new Error(`Expected array to contain ${item}`);
        }
      }
    };
  }
  
  async run() {
    console.log('\n🧪 Running StateManager Tests...\n');
    
    for (const test of this.tests) {
      try {
        await test.fn();
        console.log(`✅ ${test.name}`);
        this.results.passed++;
      } catch (error) {
        console.log(`❌ ${test.name}: ${error.message}`);
        this.results.failed++;
      }
      this.results.total++;
    }
    
    console.log('\n📊 Test Results:');
    console.log(`   Passed: ${this.results.passed}/${this.results.total}`);
    console.log(`   Failed: ${this.results.failed}/${this.results.total}`);
    
    return this.results;
  }
}

// Test suite
const runner = new TestRunner();

runner.test('StateManager initializes with initial state', () => {
  const initialState = { user: null, peers: {} };
  const stateManager = new StateManager(initialState);
  
  runner.expect(stateManager.getState()).toEqual(initialState);
});

runner.test('StateManager updates state correctly', () => {
  const stateManager = new StateManager({});
  const newState = { user: { name: 'Test User' } };
  
  stateManager.setState(newState);
  
  runner.expect(stateManager.getState()).toEqual(newState);
});

runner.test('StateManager maintains state history', () => {
  const stateManager = new StateManager({});
  
  stateManager.setState({ count: 1 }, 'INCREMENT');
  stateManager.setState({ count: 2 }, 'INCREMENT');
  
  const history = stateManager.getHistory();
  runner.expect(history.length).toBe(2);
  runner.expect(history[0].action).toBe('INCREMENT');
  runner.expect(history[1].action).toBe('INCREMENT');
});

runner.test('StateManager dispatches actions correctly', () => {
  const stateManager = new StateManager({ peers: {} });
  
  stateManager.dispatch('ADD_PEER', { id: 'peer1', name: 'Peer 1' });
  
  const state = stateManager.getState();
  runner.expect(state.peers.peer1).toBeDefined();
  runner.expect(state.peers.peer1.name).toBe('Peer 1');
});

runner.test('StateManager removes peers correctly', () => {
  const stateManager = new StateManager({ 
    peers: { 
      peer1: { id: 'peer1', name: 'Peer 1' },
      peer2: { id: 'peer2', name: 'Peer 2' }
    } 
  });
  
  stateManager.dispatch('REMOVE_PEER', 'peer1');
  
  const state = stateManager.getState();
  runner.expect(state.peers.peer1).toBe(undefined);
  runner.expect(state.peers.peer2).toBeDefined();
});

runner.test('StateManager manages subscribers correctly', () => {
  const stateManager = new StateManager({});
  let callCount = 0;
  
  const unsubscribe = stateManager.subscribe(() => {
    callCount++;
  });
  
  stateManager.setState({ test: 1 });
  stateManager.setState({ test: 2 });
  
  runner.expect(callCount).toBe(2);
  
  unsubscribe();
  stateManager.setState({ test: 3 });
  
  runner.expect(callCount).toBe(2); // Should not increase after unsubscribe
});

runner.test('StateManager handles message addition', () => {
  const stateManager = new StateManager({ discussions: {} });
  
  stateManager.dispatch('ADD_MESSAGE', {
    chatId: 'chat1',
    message: { id: 'msg1', text: 'Hello', timestamp: new Date().toISOString() }
  });
  
  const state = stateManager.getState();
  runner.expect(state.discussions.chat1).toBeDefined();
  runner.expect(state.discussions.chat1.messages.length).toBe(1);
  runner.expect(state.discussions.chat1.messages[0].text).toBe('Hello');
});

runner.test('StateManager handles call record addition', () => {
  const stateManager = new StateManager({ discussions: {} });
  
  stateManager.dispatch('ADD_CALL_RECORD', {
    chatId: 'chat1',
    call: { type: 'video', status: 'ended', duration: 120 }
  });
  
  const state = stateManager.getState();
  runner.expect(state.discussions.chat1).toBeDefined();
  runner.expect(state.discussions.chat1.calls.length).toBe(1);
  runner.expect(state.discussions.chat1.calls[0].type).toBe('video');
});

runner.test('StateManager resets correctly', () => {
  const stateManager = new StateManager({ test: 'initial' });
  
  stateManager.setState({ test: 'updated' });
  stateManager.reset();
  
  const state = stateManager.getState();
  runner.expect(state).toEqual({});
  runner.expect(stateManager.getHistory().length).toBe(0);
});

runner.test('StateManager limits history size', () => {
  const stateManager = new StateManager({});
  stateManager.maxHistorySize = 3;
  
  // Add more than maxHistorySize entries
  for (let i = 0; i < 5; i++) {
    stateManager.setState({ count: i }, `ACTION_${i}`);
  }
  
  const history = stateManager.getHistory();
  runner.expect(history.length).toBe(3);
  runner.expect(history[0].action).toBe('ACTION_2'); // Oldest should be ACTION_2
});

// Export for browser usage
if (typeof window !== 'undefined') {
  window.StateManagerTests = runner;
}

// Export for Node.js usage
export default runner;