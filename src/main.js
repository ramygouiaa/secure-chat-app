/**
 * Main entry point for the SecureChat application
 * Initializes the application and handles startup
 */

import { app } from './Application.js';
import { errorHandler } from './core/errors/ErrorHandler.js';
import { eventBus } from './core/events/EventBus.js';

// Global error handling
window.addEventListener('error', (event) => {
  errorHandler.handleError(event.error, 'SYSTEM_ERROR', {
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  });
});

window.addEventListener('unhandledrejection', (event) => {
  errorHandler.handleError(event.reason, 'SYSTEM_ERROR', {
    type: 'unhandled_promise_rejection',
  });
});

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log('Starting SecureChat Application...');
    
    // Show loading indicator
    showLoadingIndicator();
    
    // Initialize the application
    await app.initialize();
    
    // Hide loading indicator
    hideLoadingIndicator();
    
    // Listen for application events
    eventBus.on('app:initialized', () => {
      console.log('Application ready!');
      
      // Expose app instance to window for debugging
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        window.app = app;
        console.log('App instance exposed as window.app for debugging');
      }
    });
    
    // Handle critical errors
    eventBus.on('error:occurred', (error) => {
      if (error.type === 'SYSTEM_ERROR') {
        console.error('Critical system error:', error);
        
        // Show error modal for critical errors
        showErrorModal(error);
      }
    });
    
    // Handle network connectivity
    window.addEventListener('online', () => {
      eventBus.emit('network:online');
      console.log('Network connection restored');
    });
    
    window.addEventListener('offline', () => {
      eventBus.emit('network:offline');
      console.log('Network connection lost');
    });
    
  } catch (error) {
    console.error('Failed to initialize application:', error);
    
    // Hide loading indicator
    hideLoadingIndicator();
    
    // Show error message
    showInitializationError(error);
  }
});

// Utility functions

function showLoadingIndicator() {
  const loadingHtml = `
    <div id="loading-indicator" class="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50">
      <div class="bg-gray-800 p-8 rounded-lg shadow-xl text-center">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-green-400 mx-auto mb-4"></div>
        <h2 class="text-xl font-bold text-white mb-2">Loading SecureChat...</h2>
        <p class="text-gray-300">Initializing secure connection...</p>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', loadingHtml);
}

function hideLoadingIndicator() {
  const loadingIndicator = document.getElementById('loading-indicator');
  if (loadingIndicator) {
    loadingIndicator.remove();
  }
}

function showInitializationError(error) {
  const errorHtml = `
    <div id="init-error" class="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50">
      <div class="bg-gray-800 p-8 rounded-lg shadow-xl text-center max-w-md mx-4">
        <div class="text-red-500 mb-4">
          <svg class="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
        </div>
        <h2 class="text-xl font-bold text-white mb-4">Initialization Failed</h2>
        <p class="text-gray-300 mb-6">
          Failed to initialize the application. Please check your internet connection and try again.
        </p>
        <div class="space-y-2">
          <button id="retry-btn" class="w-full px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-white">
            Retry
          </button>
          <button id="details-btn" class="w-full px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded text-white">
            Show Details
          </button>
        </div>
        <div id="error-details" class="hidden mt-4 p-4 bg-gray-700 rounded text-left">
          <pre class="text-xs text-gray-300 overflow-auto max-h-40">${error.message}\n${error.stack}</pre>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', errorHtml);
  
  // Add event listeners
  document.getElementById('retry-btn').addEventListener('click', () => {
    window.location.reload();
  });
  
  document.getElementById('details-btn').addEventListener('click', () => {
    const details = document.getElementById('error-details');
    details.classList.toggle('hidden');
  });
}

function showErrorModal(error) {
  // Remove existing error modals
  const existingModal = document.getElementById('error-modal');
  if (existingModal) {
    existingModal.remove();
  }
  
  const errorHtml = `
    <div id="error-modal" class="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50">
      <div class="bg-gray-800 p-6 rounded-lg shadow-xl text-center max-w-md mx-4">
        <div class="text-red-500 mb-4">
          <svg class="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
        </div>
        <h3 class="text-lg font-bold text-white mb-2">System Error</h3>
        <p class="text-gray-300 mb-4">${error.message}</p>
        <button id="close-error-btn" class="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-white">
          Close
        </button>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', errorHtml);
  
  // Auto-close after 5 seconds
  setTimeout(() => {
    const modal = document.getElementById('error-modal');
    if (modal) {
      modal.remove();
    }
  }, 5000);
  
  // Manual close
  document.getElementById('close-error-btn').addEventListener('click', () => {
    document.getElementById('error-modal').remove();
  });
}

// Export for debugging
export { app };