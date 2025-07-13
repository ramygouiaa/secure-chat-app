/**
 * Main Application class
 * Dependency Injection Container and Application Orchestrator
 * Follows Dependency Inversion Principle
 */

import { appConfig } from './core/config/AppConfig.js';
import { eventBus } from './core/events/EventBus.js';
import { stateManager } from './core/state/StateManager.js';
import { errorHandler } from './core/errors/ErrorHandler.js';

// Services
import { EncryptionService } from './services/crypto/EncryptionService.js';
import { StorageService } from './services/storage/StorageService.js';
import { SignalingService } from './services/signaling/SignalingService.js';
import { WebRTCService } from './services/webrtc/WebRTCService.js';

// Controllers
import { ChatController } from './ui/controllers/ChatController.js';
import { CallController } from './ui/controllers/CallController.js';

// Utils
import { validateUsername } from './utils/validators.js';
import { getDeviceCapabilities } from './utils/helpers.js';

export class Application {
  constructor() {
    this.services = new Map();
    this.controllers = new Map();
    this.isInitialized = false;
    this.userName = null;
    this.clientId = null;
    
    // Bind methods
    this.handleWelcomeModal = this.handleWelcomeModal.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.handleBeforeUnload = this.handleBeforeUnload.bind(this);
  }
  
  async initialize() {
    try {
      console.log('Initializing SecureChat Application...');
      
      // Check device capabilities
      this.checkDeviceCapabilities();
      
      // Initialize core services
      await this.initializeServices();
      
      // Initialize controllers
      await this.initializeControllers();
      
      // Setup event handlers
      this.setupEventHandlers();
      
      // Setup UI event handlers
      this.setupUIEventHandlers();
      
      // Show welcome modal
      this.showWelcomeModal();
      
      this.isInitialized = true;
      console.log('Application initialized successfully');
      
      eventBus.emit('app:initialized');
      
    } catch (error) {
      errorHandler.handleError(error, 'SYSTEM_ERROR', { context: 'Application initialization' });
      throw error;
    }
  }
  
  async initializeServices() {
    try {
      // Initialize services in dependency order
      
      // 1. Storage Service (no dependencies)
      const storageService = new StorageService();
      await storageService.initialize();
      this.services.set('storage', storageService);
      
      // 2. Encryption Service (no dependencies)
      const encryptionService = new EncryptionService();
      await encryptionService.initialize();
      this.services.set('encryption', encryptionService);
      
      // 3. Signaling Service (no dependencies)
      const signalingService = new SignalingService();
      await signalingService.initialize();
      this.services.set('signaling', signalingService);
      
      // 4. WebRTC Service (depends on signaling and encryption)
      const webrtcService = new WebRTCService(signalingService, encryptionService);
      await webrtcService.initialize();
      this.services.set('webrtc', webrtcService);
      
      console.log('All services initialized successfully');
      
    } catch (error) {
      errorHandler.handleError(error, 'SYSTEM_ERROR', { context: 'Service initialization' });
      throw error;
    }
  }
  
  async initializeControllers() {
    try {
      const webrtcService = this.services.get('webrtc');
      const storageService = this.services.get('storage');
      
      // Initialize controllers
      const chatController = new ChatController(webrtcService, storageService);
      this.controllers.set('chat', chatController);
      
      const callController = new CallController(webrtcService, storageService);
      this.controllers.set('call', callController);
      
      console.log('All controllers initialized successfully');
      
    } catch (error) {
      errorHandler.handleError(error, 'SYSTEM_ERROR', { context: 'Controller initialization' });
      throw error;
    }
  }
  
  setupEventHandlers() {
    // Application-level event handlers
    
    // Handle signaling events
    eventBus.on('signaling:init', (data) => {
      this.handleSignalingInit(data);
    });
    
    eventBus.on('signaling:peer-list', (data) => {
      this.handlePeerList(data);
    });
    
    eventBus.on('signaling:connected', () => {
      this.handleSignalingConnected();
    });
    
    eventBus.on('signaling:disconnected', () => {
      this.handleSignalingDisconnected();
    });
    
    eventBus.on('signaling:reconnect-failed', () => {
      this.handleSignalingReconnectFailed();
    });
    
    // Handle user events
    eventBus.on('user:status-update', (data) => {
      this.handleUserStatusUpdate(data);
    });
    
    eventBus.on('user:register', (data) => {
      this.handleUserRegister(data);
    });
    
    // Handle UI events
    eventBus.on('ui:contact-selected', (data) => {
      this.handleContactSelected(data);
    });
    
    eventBus.on('ui:search-contacts', (data) => {
      this.handleSearchContacts(data);
    });
    
    eventBus.on('ui:sidebar-toggle', (data) => {
      this.handleSidebarToggle(data);
    });
    
    // Handle notification events
    eventBus.on('notification:show', (data) => {
      this.showNotification(data);
    });
    
    // Handle error events
    eventBus.on('error:occurred', (error) => {
      this.handleError(error);
    });
  }
  
  setupUIEventHandlers() {
    // DOM event handlers
    document.addEventListener('DOMContentLoaded', () => {
      this.setupDOMEventHandlers();
    });
    
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('beforeunload', this.handleBeforeUnload);
  }
  
  setupDOMEventHandlers() {
    // Welcome modal
    const enterChatBtn = document.getElementById('enterChatBtn');
    if (enterChatBtn) {
      enterChatBtn.addEventListener('click', this.handleWelcomeModal);
    }
    
    // Sidebar controls
    const openSidebarBtn = document.getElementById('openSidebarBtn');
    const closeSidebarBtn = document.getElementById('closeSidebarBtn');
    
    if (openSidebarBtn) {
      openSidebarBtn.addEventListener('click', () => {
        eventBus.emit('ui:sidebar-toggle', { open: true });
      });
    }
    
    if (closeSidebarBtn) {
      closeSidebarBtn.addEventListener('click', () => {
        eventBus.emit('ui:sidebar-toggle', { open: false });
      });
    }
    
    // Status selector
    const statusSelector = document.getElementById('statusSelector');
    if (statusSelector) {
      statusSelector.addEventListener('change', (e) => {
        const status = e.target.value;
        const manualOverride = status !== 'Online';
        
        stateManager.setState({
          settings: {
            ...stateManager.getState().settings,
            status,
            manualStatusOverride: manualOverride,
          }
        });
        
        eventBus.emit('user:status-update', { status });
      });
    }
    
    // Force relay toggle
    const forceRelayToggle = document.getElementById('forceRelayToggle');
    if (forceRelayToggle) {
      forceRelayToggle.addEventListener('change', (e) => {
        const forceRelay = e.target.checked;
        
        stateManager.setState({
          settings: {
            ...stateManager.getState().settings,
            forceRelay,
          }
        });
        
        eventBus.emit('notification:show', {
          message: `Force relay is now ${forceRelay ? 'ON' : 'OFF'}. Reconnect to apply.`,
          type: 'info',
        });
      });
    }
    
    // Contact search
    const contactSearchInput = document.getElementById('contactSearchInput');
    if (contactSearchInput) {
      contactSearchInput.addEventListener('input', (e) => {
        eventBus.emit('ui:search-contacts', { query: e.target.value });
      });
    }
    
    // Message input
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    
    if (messageInput) {
      messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.handleSendMessage();
        } else {
          this.handleMessageTyping();
        }
      });
      
      messageInput.addEventListener('input', () => {
        this.handleMessageInputChange();
      });
    }
    
    if (sendBtn) {
      sendBtn.addEventListener('click', () => {
        this.handleSendMessage();
      });
    }
    
    // File input
    const fileBtn = document.getElementById('fileBtn');
    const fileInput = document.getElementById('fileInput');
    
    if (fileBtn && fileInput) {
      fileBtn.addEventListener('click', () => {
        fileInput.click();
      });
      
      fileInput.addEventListener('change', (e) => {
        this.handleFileSelect(e);
      });
    }
    
    // Record button
    const recordBtn = document.getElementById('recordBtn');
    if (recordBtn) {
      recordBtn.addEventListener('click', () => {
        this.handleRecordToggle();
      });
    }
    
    // Call buttons
    const voiceCallBtn = document.getElementById('voiceCallBtn');
    const videoCallBtn = document.getElementById('videoCallBtn');
    const hangUpBtn = document.getElementById('hangUpBtn');
    const voiceHangUpBtn = document.getElementById('voiceHangUpBtn');
    const muteBtn = document.getElementById('muteBtn');
    const voiceMuteBtn = document.getElementById('voiceMuteBtn');
    
    if (voiceCallBtn) {
      voiceCallBtn.addEventListener('click', () => {
        this.handleCallInitiate(false);
      });
    }
    
    if (videoCallBtn) {
      videoCallBtn.addEventListener('click', () => {
        this.handleCallInitiate(true);
      });
    }
    
    if (hangUpBtn) {
      hangUpBtn.addEventListener('click', () => {
        this.handleCallHangUp();
      });
    }
    
    if (voiceHangUpBtn) {
      voiceHangUpBtn.addEventListener('click', () => {
        this.handleCallHangUp();
      });
    }
    
    if (muteBtn) {
      muteBtn.addEventListener('click', () => {
        this.handleCallMute();
      });
    }
    
    if (voiceMuteBtn) {
      voiceMuteBtn.addEventListener('click', () => {
        this.handleCallMute();
      });
    }
    
    // Incoming call modal
    const answerCallBtn = document.getElementById('answerCallBtn');
    const declineCallBtn = document.getElementById('declineCallBtn');
    
    if (answerCallBtn) {
      answerCallBtn.addEventListener('click', () => {
        this.handleCallAnswer();
      });
    }
    
    if (declineCallBtn) {
      declineCallBtn.addEventListener('click', () => {
        this.handleCallDecline();
      });
    }
    
    // Video call dialog dragging
    this.setupVideoCallDragging();
  }
  
  setupVideoCallDragging() {
    const videoCallDialog = document.getElementById('videoCallDialog');
    const videoCallHeader = document.getElementById('videoCallHeader');
    
    if (!videoCallDialog || !videoCallHeader) return;
    
    let isDragging = false;
    let offsetX, offsetY;
    
    videoCallHeader.addEventListener('mousedown', (e) => {
      isDragging = true;
      offsetX = e.clientX - videoCallDialog.offsetLeft;
      offsetY = e.clientY - videoCallDialog.offsetTop;
      videoCallDialog.style.cursor = 'grabbing';
    });
    
    document.addEventListener('mousemove', (e) => {
      if (isDragging) {
        videoCallDialog.style.left = `${e.clientX - offsetX}px`;
        videoCallDialog.style.top = `${e.clientY - offsetY}px`;
      }
    });
    
    document.addEventListener('mouseup', () => {
      isDragging = false;
      videoCallDialog.style.cursor = 'default';
    });
  }
  
  // Event handlers
  
  handleSignalingInit(data) {
    this.clientId = data.id;
    
    stateManager.setState({
      clientId: data.id,
      connectionStatus: 'connected',
    });
    
    // Update UI
    const clientIdDisplay = document.getElementById('clientIdDisplay');
    if (clientIdDisplay) {
      clientIdDisplay.textContent = data.id;
    }
    
    // Register user if we have a name
    if (this.userName) {
      this.registerUser();
    }
  }
  
  handlePeerList(data) {
    const peers = {};
    data.peers.forEach(peer => {
      if (peer.id !== this.clientId) {
        peers[peer.id] = peer;
      }
    });
    
    stateManager.setState({ peers });
    this.renderContactList(data.peers);
  }
  
  handleSignalingConnected() {
    stateManager.setState({ connectionStatus: 'connected' });
    
    const connectionStatus = document.getElementById('connectionStatus');
    if (connectionStatus) {
      connectionStatus.textContent = 'Connected';
    }
  }
  
  handleSignalingDisconnected() {
    stateManager.setState({ connectionStatus: 'disconnected' });
    
    const connectionStatus = document.getElementById('connectionStatus');
    if (connectionStatus) {
      connectionStatus.textContent = 'Disconnected';
    }
  }
  
  handleSignalingReconnectFailed() {
    eventBus.emit('notification:show', {
      message: 'Failed to reconnect to server. Please refresh the page.',
      type: 'error',
    });
  }
  
  handleUserStatusUpdate(data) {
    const signalingService = this.services.get('signaling');
    if (signalingService) {
      signalingService.updateStatus(data.status);
    }
  }
  
  handleUserRegister(data) {
    this.userName = data.name;
    this.registerUser();
  }
  
  handleContactSelected(data) {
    const chatController = this.controllers.get('chat');
    if (chatController) {
      chatController.render(data);
    }
  }
  
  handleSearchContacts(data) {
    this.filterContacts(data.query);
  }
  
  handleSidebarToggle(data) {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      if (data.open) {
        sidebar.classList.remove('hidden');
      } else {
        sidebar.classList.add('hidden');
      }
    }
  }
  
  // UI Event Handlers
  
  handleWelcomeModal() {
    const welcomeModal = document.getElementById('welcomeModal');
    if (welcomeModal) {
      welcomeModal.classList.add('hidden');
    }
    
    // Show sidebar
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      sidebar.classList.remove('hidden');
    }
    
    // Get user name
    this.promptForUserName();
  }
  
  async promptForUserName() {
    let userName = null;
    
    while (!userName) {
      const input = prompt('Enter your name:');
      
      if (!input) {
        alert('A name is required to join the chat.');
        continue;
      }
      
      const validation = validateUsername(input);
      if (!validation.isValid) {
        alert(`Invalid name: ${validation.errors[0]}`);
        continue;
      }
      
      userName = validation.sanitized;
    }
    
    this.userName = userName;
    
    // Update UI
    const displayName = document.getElementById('displayName');
    if (displayName) {
      displayName.textContent = userName;
    }
    
    // Update state
    stateManager.setState({
      user: { name: userName }
    });
    
    // Register with server if connected
    if (this.clientId) {
      this.registerUser();
    }
  }
  
  registerUser() {
    const signalingService = this.services.get('signaling');
    if (signalingService && this.userName) {
      signalingService.register(this.userName);
    }
  }
  
  handleSendMessage() {
    const messageInput = document.getElementById('messageInput');
    if (!messageInput) return;
    
    const text = messageInput.value.trim();
    if (!text) return;
    
    const chatController = this.controllers.get('chat');
    if (chatController) {
      chatController.handleEvent({
        type: 'message:send',
        data: { text }
      });
    }
    
    messageInput.value = '';
    this.handleMessageInputChange();
  }
  
  handleMessageTyping() {
    const chatController = this.controllers.get('chat');
    if (chatController) {
      chatController.handleEvent({
        type: 'message:typing',
        data: {}
      });
    }
  }
  
  handleMessageInputChange() {
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const recordBtn = document.getElementById('recordBtn');
    
    if (messageInput && sendBtn && recordBtn) {
      if (messageInput.value.trim().length > 0) {
        sendBtn.classList.remove('hidden');
        recordBtn.classList.add('hidden');
      } else {
        sendBtn.classList.add('hidden');
        recordBtn.classList.remove('hidden');
      }
    }
  }
  
  handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const chatController = this.controllers.get('chat');
    if (chatController) {
      chatController.handleEvent({
        type: 'file:send',
        data: { file }
      });
    }
    
    // Reset file input
    event.target.value = '';
  }
  
  handleRecordToggle() {
    const recordBtn = document.getElementById('recordBtn');
    if (!recordBtn) return;
    
    const isRecording = recordBtn.innerHTML.includes('fa-stop');
    
    const chatController = this.controllers.get('chat');
    if (chatController) {
      chatController.handleEvent({
        type: 'voice:record',
        data: { action: isRecording ? 'stop' : 'start' }
      });
    }
    
    // Update button UI
    if (isRecording) {
      recordBtn.innerHTML = '<i class="fas fa-microphone"></i>';
    } else {
      recordBtn.innerHTML = '<i class="fas fa-stop"></i>';
    }
  }
  
  handleCallInitiate(isVideo) {
    const currentChat = stateManager.getState().currentChat;
    if (!currentChat) {
      eventBus.emit('notification:show', {
        message: 'Please select a contact to call.',
        type: 'warning',
      });
      return;
    }
    
    const callController = this.controllers.get('call');
    if (callController) {
      callController.handleEvent({
        type: 'call:initiate',
        data: { targetId: currentChat.id, isVideo }
      });
    }
  }
  
  handleCallAnswer() {
    const callController = this.controllers.get('call');
    if (callController) {
      callController.handleEvent({
        type: 'call:answer',
        data: {}
      });
    }
  }
  
  handleCallDecline() {
    const callController = this.controllers.get('call');
    if (callController) {
      callController.handleEvent({
        type: 'call:decline',
        data: {}
      });
    }
  }
  
  handleCallHangUp() {
    const callController = this.controllers.get('call');
    if (callController) {
      callController.handleEvent({
        type: 'call:hangup',
        data: {}
      });
    }
  }
  
  handleCallMute() {
    const callController = this.controllers.get('call');
    if (callController) {
      const isMuted = callController.getCallState().isMuted;
      
      callController.handleEvent({
        type: isMuted ? 'call:unmute' : 'call:mute',
        data: {}
      });
    }
  }
  
  handleVisibilityChange() {
    const isVisible = document.visibilityState === 'visible';
    
    eventBus.emit('ui:visibility-change', { visible: isVisible });
    
    const settings = stateManager.getState().settings;
    if (settings?.manualStatusOverride) return;
    
    const newStatus = isVisible ? 'Online' : 'Away';
    eventBus.emit('user:status-update', { status: newStatus });
    
    // Mark messages as read when becoming visible
    if (isVisible) {
      const currentChat = stateManager.getState().currentChat;
      if (currentChat) {
        const chatController = this.controllers.get('chat');
        if (chatController) {
          chatController.markMessagesAsRead(currentChat.id);
        }
      }
    }
  }
  
  handleBeforeUnload() {
    // Cleanup resources
    this.cleanup();
  }
  
  handleError(error) {
    console.error('Application error:', error);
    
    // Additional error handling based on error type
    if (error.type === 'NETWORK_ERROR') {
      // Handle network errors
    } else if (error.type === 'WEBRTC_ERROR') {
      // Handle WebRTC errors
    }
  }
  
  // UI Methods
  
  showWelcomeModal() {
    const welcomeModal = document.getElementById('welcomeModal');
    if (welcomeModal) {
      welcomeModal.classList.remove('hidden');
    }
  }
  
  renderContactList(peers) {
    const contactsList = document.getElementById('contactsList');
    if (!contactsList) return;
    
    const currentSearch = document.getElementById('contactSearchInput')?.value.toLowerCase() || '';
    
    contactsList.innerHTML = '';
    
    peers.forEach(peer => {
      if (peer.id === this.clientId) return;
      
      if (currentSearch && !peer.name.toLowerCase().includes(currentSearch)) {
        return;
      }
      
      const item = this.createContactItem(peer);
      contactsList.appendChild(item);
    });
  }
  
  createContactItem(peer) {
    const item = document.createElement('div');
    item.className = 'contact-item flex items-center gap-3 p-2 hover:bg-gray-700 rounded cursor-pointer';
    item.dataset.id = peer.id;
    
    const statusColors = appConfig.get('ui.statusColors');
    const statusColor = statusColors[peer.status] || statusColors.Offline;
    
    item.innerHTML = `
      <div class="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
        <span class="text-white text-sm">${peer.name.charAt(0)}</span>
      </div>
      <div class="flex-1">
        <div class="text-sm font-medium">${this.escapeHtml(peer.name)}</div>
        <div class="text-xs text-gray-400">${peer.status || 'Offline'}</div>
      </div>
      <div class="w-2 h-2 ${statusColor} rounded-full"></div>
    `;
    
    item.addEventListener('click', () => {
      eventBus.emit('ui:contact-selected', {
        targetId: peer.id,
        targetName: peer.name
      });
    });
    
    return item;
  }
  
  filterContacts(query) {
    const peers = Object.values(stateManager.getState().peers || {});
    this.renderContactList(peers);
  }
  
  showNotification(data) {
    const notification = document.getElementById('notification');
    if (!notification) return;
    
    const { message, type = 'info' } = data;
    
    notification.textContent = message;
    notification.className = 'fixed top-0 left-0 right-0 p-4 text-white text-center z-50';
    
    switch (type) {
      case 'error':
        notification.classList.add('bg-red-600');
        break;
      case 'warning':
        notification.classList.add('bg-yellow-600');
        break;
      case 'success':
        notification.classList.add('bg-green-600');
        break;
      default:
        notification.classList.add('bg-blue-600');
    }
    
    notification.classList.remove('hidden');
    
    setTimeout(() => {
      notification.classList.add('hidden');
    }, appConfig.get('ui.notificationTimeout'));
  }
  
  // Utility methods
  
  checkDeviceCapabilities() {
    const capabilities = getDeviceCapabilities();
    
    if (!capabilities.webrtc) {
      errorHandler.createUserError('WebRTC is not supported in this browser');
    }
    
    if (!capabilities.webCrypto) {
      errorHandler.createUserError('Web Crypto API is not supported in this browser');
    }
    
    if (!capabilities.sessionStorage) {
      errorHandler.createUserError('Session Storage is not supported in this browser');
    }
    
    console.log('Device capabilities:', capabilities);
  }
  
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  getService(name) {
    return this.services.get(name);
  }
  
  getController(name) {
    return this.controllers.get(name);
  }
  
  getState() {
    return stateManager.getState();
  }
  
  async cleanup() {
    try {
      // Cleanup controllers
      for (const controller of this.controllers.values()) {
        if (controller.cleanup) {
          controller.cleanup();
        }
      }
      
      // Cleanup services
      for (const service of this.services.values()) {
        if (service.destroy) {
          await service.destroy();
        }
      }
      
      // Remove event listeners
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
      window.removeEventListener('beforeunload', this.handleBeforeUnload);
      
      this.isInitialized = false;
      console.log('Application cleaned up');
      
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }
  
  // Public API
  
  isReady() {
    return this.isInitialized;
  }
  
  getVersion() {
    return '2.0.0';
  }
  
  getInfo() {
    return {
      version: this.getVersion(),
      isInitialized: this.isInitialized,
      userName: this.userName,
      clientId: this.clientId,
      services: Array.from(this.services.keys()),
      controllers: Array.from(this.controllers.keys()),
      state: this.getState(),
    };
  }
}

// Export singleton instance
export const app = new Application();