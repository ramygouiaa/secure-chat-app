/**
 * Test runner for the SecureChat application
 * Orchestrates all test suites
 */

// Import test suites
import StateManagerTests from './unit/StateManager.test.js';
import EventBusTests from './unit/EventBus.test.js';
import ApplicationTests from './integration/Application.test.js';

export class TestRunner {
  constructor() {
    this.testSuites = [
      { name: 'StateManager Unit Tests', runner: StateManagerTests },
      { name: 'EventBus Unit Tests', runner: EventBusTests },
      { name: 'Application Integration Tests', runner: ApplicationTests },
    ];
    
    this.overallResults = {
      passed: 0,
      failed: 0,
      total: 0,
      suites: 0,
    };
  }
  
  async runAll() {
    console.log('🚀 Starting SecureChat Test Suite\n');
    console.log('=' .repeat(50));
    
    for (const suite of this.testSuites) {
      console.log(`\n📦 Running ${suite.name}:`);
      console.log('-'.repeat(40));
      
      try {
        const results = await suite.runner.run();
        
        this.overallResults.passed += results.passed;
        this.overallResults.failed += results.failed;
        this.overallResults.total += results.total;
        this.overallResults.suites++;
        
      } catch (error) {
        console.log(`❌ Test suite failed: ${error.message}`);
        this.overallResults.failed++;
        this.overallResults.total++;
      }
    }
    
    this.printOverallResults();
    return this.overallResults;
  }
  
  async runSuite(suiteName) {
    const suite = this.testSuites.find(s => s.name.includes(suiteName));
    
    if (!suite) {
      console.log(`❌ Test suite '${suiteName}' not found`);
      return null;
    }
    
    console.log(`\n📦 Running ${suite.name}:`);
    console.log('-'.repeat(40));
    
    return await suite.runner.run();
  }
  
  printOverallResults() {
    console.log('\n');
    console.log('=' .repeat(50));
    console.log('🏁 Overall Test Results');
    console.log('=' .repeat(50));
    console.log(`Test Suites: ${this.overallResults.suites}`);
    console.log(`Tests:       ${this.overallResults.passed} passed, ${this.overallResults.failed} failed, ${this.overallResults.total} total`);
    
    const successRate = ((this.overallResults.passed / this.overallResults.total) * 100).toFixed(1);
    console.log(`Success Rate: ${successRate}%`);
    
    if (this.overallResults.failed === 0) {
      console.log('\n🎉 All tests passed! ');
    } else {
      console.log(`\n⚠️  ${this.overallResults.failed} test(s) failed`);
    }
    
    console.log('=' .repeat(50));
  }
  
  // Utility methods for individual testing
  static async testStateManager() {
    return await StateManagerTests.run();
  }
  
  static async testEventBus() {
    return await EventBusTests.run();
  }
  
  static async testApplication() {
    return await ApplicationTests.run();
  }
}

// Export singleton instance
export const testRunner = new TestRunner();

// Browser global access
if (typeof window !== 'undefined') {
  window.SecureChatTests = {
    TestRunner,
    testRunner,
    runAll: () => testRunner.runAll(),
    runSuite: (name) => testRunner.runSuite(name),
    StateManager: () => StateManagerTests.run(),
    EventBus: () => EventBusTests.run(),
    Application: () => ApplicationTests.run(),
  };
  
  console.log('🧪 SecureChat Tests available at window.SecureChatTests');
  console.log('   Run all tests: SecureChatTests.runAll()');
  console.log('   Run specific suite: SecureChatTests.runSuite("StateManager")');
}