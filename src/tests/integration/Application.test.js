/**
 * Integration tests for Application
 * Testing application initialization and service integration
 */

import { Application } from '../../Application.js';

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
      toBeTruthy: () => {
        if (!actual) {
          throw new Error('Expected value to be truthy');
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
    console.log('\n🧪 Running Application Integration Tests...\n');
    
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

runner.test('Application initializes successfully', async () => {
  const app = new Application();
  
  // This should not throw an error
  await app.initialize();
  
  runner.expect(app.isReady()).toBe(true);
});

runner.test('Application initializes all required services', async () => {
  const app = new Application();
  await app.initialize();
  
  runner.expect(app.getService('storage')).toBeDefined();
  runner.expect(app.getService('encryption')).toBeDefined();
  runner.expect(app.getService('signaling')).toBeDefined();
  runner.expect(app.getService('webrtc')).toBeDefined();
});

runner.test('Application initializes all required controllers', async () => {
  const app = new Application();
  await app.initialize();
  
  runner.expect(app.getController('chat')).toBeDefined();
  runner.expect(app.getController('call')).toBeDefined();
});

runner.test('Application provides correct version', () => {
  const app = new Application();
  
  runner.expect(app.getVersion()).toBe('2.0.0');
});

runner.test('Application provides comprehensive info', async () => {
  const app = new Application();
  await app.initialize();
  
  const info = app.getInfo();
  
  runner.expect(info.version).toBeDefined();
  runner.expect(info.isInitialized).toBe(true);
  runner.expect(info.services).toContain('storage');
  runner.expect(info.services).toContain('encryption');
  runner.expect(info.services).toContain('signaling');
  runner.expect(info.services).toContain('webrtc');
  runner.expect(info.controllers).toContain('chat');
  runner.expect(info.controllers).toContain('call');
  runner.expect(info.state).toBeDefined();
});

runner.test('Application handles device capability check', async () => {
  const app = new Application();
  
  // This should not throw an error even if some capabilities are missing
  await app.initialize();
  
  runner.expect(app.isReady()).toBe(true);
});

runner.test('Application state is properly initialized', async () => {
  const app = new Application();
  await app.initialize();
  
  const state = app.getState();
  
  runner.expect(state.user).toBe(null);
  runner.expect(state.clientId).toBe(null);
  runner.expect(state.peers).toEqual({});
  runner.expect(state.currentChat).toBe(null);
  runner.expect(state.discussions).toEqual({});
  runner.expect(state.connectionStatus).toBeDefined();
  runner.expect(state.uiState).toBeDefined();
  runner.expect(state.settings).toBeDefined();
});

runner.test('Application services are properly connected', async () => {
  const app = new Application();
  await app.initialize();
  
  const webrtcService = app.getService('webrtc');
  const signalingService = app.getService('signaling');
  const encryptionService = app.getService('encryption');
  
  // WebRTC should have references to signaling and encryption services
  runner.expect(webrtcService.signalingService).toBe(signalingService);
  runner.expect(webrtcService.encryptionService).toBe(encryptionService);
});

runner.test('Application controllers have access to services', async () => {
  const app = new Application();
  await app.initialize();
  
  const chatController = app.getController('chat');
  const callController = app.getController('call');
  
  runner.expect(chatController.webrtcService).toBeDefined();
  runner.expect(chatController.storageService).toBeDefined();
  runner.expect(callController.webrtcService).toBeDefined();
  runner.expect(callController.storageService).toBeDefined();
});

runner.test('Application cleanup works correctly', async () => {
  const app = new Application();
  await app.initialize();
  
  runner.expect(app.isReady()).toBe(true);
  
  await app.cleanup();
  
  runner.expect(app.isReady()).toBe(false);
});

runner.test('Application handles service initialization errors gracefully', async () => {
  const app = new Application();
  
  // Mock a service to fail initialization
  const originalInitializeServices = app.initializeServices;
  app.initializeServices = async () => {
    throw new Error('Service initialization failed');
  };
  
  try {
    await app.initialize();
    throw new Error('Should have thrown an error');
  } catch (error) {
    runner.expect(error.message).toBe('Service initialization failed');
  }
  
  // Restore original method
  app.initializeServices = originalInitializeServices;
});

runner.test('Application maintains singleton behavior for core instances', async () => {
  const app1 = new Application();
  const app2 = new Application();
  
  await app1.initialize();
  await app2.initialize();
  
  // Both apps should use the same state manager instance
  const state1 = app1.getState();
  const state2 = app2.getState();
  
  // State objects should be the same reference (singleton behavior)
  runner.expect(state1).toEqual(state2);
});

// Export for browser usage
if (typeof window !== 'undefined') {
  window.ApplicationTests = runner;
}

// Export for Node.js usage
export default runner;