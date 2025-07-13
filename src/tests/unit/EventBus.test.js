/**
 * Unit tests for EventBus
 * Testing event system functionality
 */

import { EventBus } from '../../core/events/EventBus.js';

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
      toBeInstanceOf: (constructor) => {
        if (!(actual instanceof constructor)) {
          throw new Error(`Expected instance of ${constructor.name}`);
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
    console.log('\n🧪 Running EventBus Tests...\n');
    
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

runner.test('EventBus emits and receives events', () => {
  const eventBus = new EventBus();
  let receivedData = null;
  
  eventBus.on('test-event', (data) => {
    receivedData = data;
  });
  
  eventBus.emit('test-event', { message: 'Hello' });
  
  runner.expect(receivedData).toEqual({ message: 'Hello' });
});

runner.test('EventBus supports multiple listeners', () => {
  const eventBus = new EventBus();
  let count1 = 0;
  let count2 = 0;
  
  eventBus.on('test-event', () => count1++);
  eventBus.on('test-event', () => count2++);
  
  eventBus.emit('test-event');
  
  runner.expect(count1).toBe(1);
  runner.expect(count2).toBe(1);
});

runner.test('EventBus removes listeners correctly', () => {
  const eventBus = new EventBus();
  let count = 0;
  
  const handler = () => count++;
  eventBus.on('test-event', handler);
  
  eventBus.emit('test-event');
  runner.expect(count).toBe(1);
  
  eventBus.off('test-event', handler);
  eventBus.emit('test-event');
  
  runner.expect(count).toBe(1); // Should not increase after removal
});

runner.test('EventBus returns unsubscribe function', () => {
  const eventBus = new EventBus();
  let count = 0;
  
  const unsubscribe = eventBus.on('test-event', () => count++);
  
  eventBus.emit('test-event');
  runner.expect(count).toBe(1);
  
  unsubscribe();
  eventBus.emit('test-event');
  
  runner.expect(count).toBe(1); // Should not increase after unsubscribe
});

runner.test('EventBus supports once listeners', () => {
  const eventBus = new EventBus();
  let count = 0;
  
  eventBus.once('test-event', () => count++);
  
  eventBus.emit('test-event');
  eventBus.emit('test-event');
  eventBus.emit('test-event');
  
  runner.expect(count).toBe(1); // Should only be called once
});

runner.test('EventBus handles errors in listeners', () => {
  const eventBus = new EventBus();
  let normalListenerCalled = false;
  
  // Add a listener that throws an error
  eventBus.on('test-event', () => {
    throw new Error('Test error');
  });
  
  // Add a normal listener
  eventBus.on('test-event', () => {
    normalListenerCalled = true;
  });
  
  // Emit should not throw and other listeners should still be called
  eventBus.emit('test-event');
  
  runner.expect(normalListenerCalled).toBe(true);
});

runner.test('EventBus tracks event names correctly', () => {
  const eventBus = new EventBus();
  
  eventBus.on('event1', () => {});
  eventBus.on('event2', () => {});
  eventBus.on('event1', () => {}); // Another listener for event1
  
  const eventNames = eventBus.getEventNames();
  
  runner.expect(eventNames).toContain('event1');
  runner.expect(eventNames).toContain('event2');
  runner.expect(eventNames.length).toBe(2);
});

runner.test('EventBus counts listeners correctly', () => {
  const eventBus = new EventBus();
  
  eventBus.on('test-event', () => {});
  eventBus.on('test-event', () => {});
  eventBus.on('test-event', () => {});
  
  runner.expect(eventBus.getListenerCount('test-event')).toBe(3);
  runner.expect(eventBus.getListenerCount('non-existent')).toBe(0);
});

runner.test('EventBus removes all listeners for event', () => {
  const eventBus = new EventBus();
  
  eventBus.on('test-event', () => {});
  eventBus.on('test-event', () => {});
  eventBus.on('other-event', () => {});
  
  runner.expect(eventBus.getListenerCount('test-event')).toBe(2);
  runner.expect(eventBus.getListenerCount('other-event')).toBe(1);
  
  eventBus.removeAllListeners('test-event');
  
  runner.expect(eventBus.getListenerCount('test-event')).toBe(0);
  runner.expect(eventBus.getListenerCount('other-event')).toBe(1);
});

runner.test('EventBus removes all listeners', () => {
  const eventBus = new EventBus();
  
  eventBus.on('event1', () => {});
  eventBus.on('event2', () => {});
  
  runner.expect(eventBus.getEventNames().length).toBe(2);
  
  eventBus.removeAllListeners();
  
  runner.expect(eventBus.getEventNames().length).toBe(0);
});

runner.test('EventBus returns false for non-existent events', () => {
  const eventBus = new EventBus();
  
  const result = eventBus.emit('non-existent-event');
  
  runner.expect(result).toBe(false);
});

runner.test('EventBus returns true for existing events', () => {
  const eventBus = new EventBus();
  
  eventBus.on('test-event', () => {});
  
  const result = eventBus.emit('test-event');
  
  runner.expect(result).toBe(true);
});

// Export for browser usage
if (typeof window !== 'undefined') {
  window.EventBusTests = runner;
}

// Export for Node.js usage
export default runner;