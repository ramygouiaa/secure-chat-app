/**
 * Chat controller managing chat-related UI and interactions
 * Follows Single Responsibility Principle
 */

import { IUIController } from '../../core/interfaces.js';
import { eventBus } from '../../core/events/EventBus.js';
import { stateManager } from '../../core/state/StateManager.js';
import { errorHandler } from '../../core/errors/ErrorHandler.js';
import { generateUUID, formatTime, formatDuration } from '../../utils/helpers.js';
import { validateMessage, validateFile } from '../../utils/validators.js';

export class ChatController extends IUIController {
  constructor(webrtcService, storageService) {
    super();
    this.webrtcService = webrtcService;
    this.storageService = storageService;
    this.currentTargetId = null;
    this.currentTargetName = null;
    this.isTyping = false;
    this.typingTimeout = null;
    this.recordingChunks = [];
    this.mediaRecorder = null;
    
    this.setupEventHandlers();
  }
  
  async render(data) {
    const { targetId, targetName } = data;
    
    if (targetId === this.currentTargetId) {
      return; // Already chatting with this target
    }
    
    this.currentTargetId = targetId;
    this.currentTargetName = targetName;
    
    // Update UI
    this.updateChatHeader(targetName);
    
    // Load and render messages
    await this.loadMessages(targetId);
    
    // Connect to peer
    try {
      await this.webrtcService.connect(targetId, true);
    } catch (error) {
      console.warn('Failed to connect via WebRTC, using relay');
    }
    
    // Update state
    stateManager.setState({
      currentChat: {
        id: targetId,
        name: targetName,
      }
    });
    
    // Mark messages as read
    this.markMessagesAsRead(targetId);
    
    eventBus.emit('chat:opened', { targetId, targetName });
  }
  
  async handleEvent(event) {
    switch (event.type) {
      case 'message:send':
        await this.handleSendMessage(event.data);
        break;
      case 'message:typing':
        await this.handleTyping();
        break;
      case 'message:stop-typing':
        await this.handleStopTyping();
        break;
      case 'file:send':
        await this.handleSendFile(event.data);
        break;
      case 'voice:record':
        await this.handleVoiceRecord(event.data);
        break;
      case 'messages:mark-read':
        await this.handleMarkRead(event.data);
        break;
      default:
        console.warn(`Unknown event type: ${event.type}`);
    }
  }
  
  setupEventHandlers() {
    // Listen for incoming messages
    eventBus.on('webrtc:message-received', (data) => {
      this.handleIncomingMessage(data.message, data.targetId);
    });
    
    // Listen for typing indicators
    eventBus.on('message:typing-received', (data) => {
      this.handleTypingIndicator(data.targetId, true);
    });
    
    eventBus.on('message:stop-typing-received', (data) => {
      this.handleTypingIndicator(data.targetId, false);
    });
    
    // Listen for message status updates
    eventBus.on('message:status-received', (data) => {
      this.handleMessageStatusUpdate(data);
    });
  }
  
  async handleSendMessage(data) {
    const { text } = data;
    
    if (!this.currentTargetId) {
      errorHandler.createUserError('No chat selected');
      return;
    }
    
    // Validate message
    const validation = validateMessage(text);
    if (!validation.isValid) {
      errorHandler.createValidationError(validation.errors[0]);
      return;
    }
    
    try {
      const message = {
        id: generateUUID(),
        type: 'text',
        content: validation.sanitized,
        timestamp: new Date().toISOString(),
        status: 'sent',
      };
      
      // Add to local discussion immediately
      await this.addMessageToDiscussion(message, 'You');
      
      // Send via WebRTC
      await this.webrtcService.sendMessage(message);
      
      // Update message status
      setTimeout(() => {
        this.updateMessageStatus(message.id, 'delivered');
      }, 1000);
      
    } catch (error) {
      errorHandler.createWebRTCError('Failed to send message', { error });
    }
  }
  
  async handleTyping() {
    if (!this.currentTargetId || this.isTyping) {
      return;
    }
    
    this.isTyping = true;
    
    try {
      await this.webrtcService.sendMessage({ type: 'typing' });
    } catch (error) {
      console.warn('Failed to send typing indicator:', error);
    }
    
    // Clear existing timeout
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
    
    // Set timeout to stop typing
    this.typingTimeout = setTimeout(() => {
      this.handleStopTyping();
    }, 1000);
  }
  
  async handleStopTyping() {
    if (!this.currentTargetId || !this.isTyping) {
      return;
    }
    
    this.isTyping = false;
    
    try {
      await this.webrtcService.sendMessage({ type: 'stop-typing' });
    } catch (error) {
      console.warn('Failed to send stop typing indicator:', error);
    }
    
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
      this.typingTimeout = null;
    }
  }
  
  async handleSendFile(data) {
    const { file } = data;
    
    if (!this.currentTargetId) {
      errorHandler.createUserError('No chat selected');
      return;
    }
    
    // Validate file
    const validation = validateFile(file, {
      maxSize: 50 * 1024 * 1024, // 50MB
    });
    
    if (!validation.isValid) {
      errorHandler.createValidationError(validation.errors[0]);
      return;
    }
    
    try {
      const fileId = generateUUID();
      const messageId = generateUUID();
      const timestamp = new Date().toISOString();
      
      // Add to local discussion immediately
      const fileUrl = URL.createObjectURL(file);
      await this.addMessageToDiscussion({
        id: messageId,
        type: 'file',
        file: { name: file.name, url: fileUrl },
        timestamp,
        status: 'sent',
      }, 'You');
      
      // Send file in chunks
      await this.sendFileInChunks(file, fileId, messageId, timestamp);
      
    } catch (error) {
      errorHandler.createWebRTCError('Failed to send file', { error });
    }
  }
  
  async sendFileInChunks(file, fileId, messageId, timestamp) {
    const CHUNK_SIZE = 16384; // 16KB chunks
    
    // Send start message
    await this.webrtcService.sendMessage({
      type: 'file-start',
      messageId,
      fileId,
      fileName: file.name,
      fileType: file.type,
      timestamp,
    });
    
    // Send file chunks
    const arrayBuffer = await file.arrayBuffer();
    for (let i = 0; i < arrayBuffer.byteLength; i += CHUNK_SIZE) {
      const chunk = arrayBuffer.slice(i, i + CHUNK_SIZE);
      await this.webrtcService.sendMessage({
        type: 'file-chunk',
        fileId,
        data: this.arrayBufferToBase64(chunk),
      });
    }
    
    // Send end message
    await this.webrtcService.sendMessage({
      type: 'file-end',
      fileId,
    });
  }
  
  async handleVoiceRecord(data) {
    const { action } = data;
    
    if (!this.currentTargetId) {
      errorHandler.createUserError('No chat selected');
      return;
    }
    
    try {
      if (action === 'start') {
        await this.startVoiceRecording();
      } else if (action === 'stop') {
        await this.stopVoiceRecording();
      }
    } catch (error) {
      errorHandler.createWebRTCError('Voice recording failed', { error });
    }
  }
  
  async startVoiceRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      this.recordingChunks = [];
      
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.recordingChunks.push(event.data);
        }
      };
      
      this.mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        await this.processVoiceRecording();
      };
      
      this.mediaRecorder.start();
      eventBus.emit('voice:recording-started');
      
    } catch (error) {
      errorHandler.createWebRTCError('Failed to start voice recording', { error });
      throw error;
    }
  }
  
  async stopVoiceRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
      eventBus.emit('voice:recording-stopped');
    }
  }
  
  async processVoiceRecording() {
    try {
      const blob = new Blob(this.recordingChunks, { type: 'audio/webm' });
      const messageId = generateUUID();
      const timestamp = new Date().toISOString();
      
      // Add to local discussion
      const audioUrl = URL.createObjectURL(blob);
      await this.addMessageToDiscussion({
        id: messageId,
        type: 'voice',
        audioUrl,
        timestamp,
        status: 'sent',
      }, 'You');
      
      // Send voice message
      const arrayBuffer = await blob.arrayBuffer();
      await this.webrtcService.sendMessage({
        id: messageId,
        type: 'voice',
        data: this.arrayBufferToBase64(arrayBuffer),
        timestamp,
      });
      
      this.recordingChunks = [];
      
    } catch (error) {
      errorHandler.createWebRTCError('Failed to process voice recording', { error });
    }
  }
  
  async handleIncomingMessage(message, senderId) {
    const senderName = stateManager.getState().peers[senderId]?.name || 'Unknown';
    
    switch (message.type) {
      case 'text':
        await this.addMessageToDiscussion({
          id: message.id,
          type: 'text',
          text: message.content,
          timestamp: message.timestamp,
          status: 'received',
        }, senderName);
        
        // Send delivery confirmation
        await this.sendMessageStatus('delivered', [message.id], senderId);
        break;
        
      case 'voice':
        const audioBlob = new Blob([this.base64ToArrayBuffer(message.data)], {
          type: 'audio/webm',
        });
        const audioUrl = URL.createObjectURL(audioBlob);
        
        await this.addMessageToDiscussion({
          id: message.id,
          type: 'voice',
          audioUrl,
          timestamp: message.timestamp,
          status: 'received',
        }, senderName);
        
        await this.sendMessageStatus('delivered', [message.id], senderId);
        break;
        
      case 'file-start':
        this.handleFileStart(message, senderId);
        break;
        
      case 'file-chunk':
        this.handleFileChunk(message);
        break;
        
      case 'file-end':
        await this.handleFileEnd(message, senderId);
        break;
        
      case 'typing':
        this.handleTypingIndicator(senderId, true);
        break;
        
      case 'stop-typing':
        this.handleTypingIndicator(senderId, false);
        break;
        
      default:
        console.warn(`Unknown message type: ${message.type}`);
    }
  }
  
  handleFileStart(message, senderId) {
    if (!this.fileChunks) {
      this.fileChunks = new Map();
    }
    
    this.fileChunks.set(message.fileId, {
      chunks: [],
      meta: {
        name: message.fileName,
        type: message.fileType,
        timestamp: message.timestamp,
        messageId: message.messageId,
      },
    });
    
    this.sendMessageStatus('delivered', [message.messageId], senderId);
  }
  
  handleFileChunk(message) {
    const fileData = this.fileChunks?.get(message.fileId);
    if (fileData) {
      const chunk = this.base64ToArrayBuffer(message.data);
      fileData.chunks.push(chunk);
    }
  }
  
  async handleFileEnd(message, senderId) {
    const fileData = this.fileChunks?.get(message.fileId);
    if (fileData) {
      const fileBlob = new Blob(fileData.chunks, { type: fileData.meta.type });
      const fileUrl = URL.createObjectURL(fileBlob);
      
      const senderName = stateManager.getState().peers[senderId]?.name || 'Unknown';
      
      await this.addMessageToDiscussion({
        id: fileData.meta.messageId,
        type: 'file',
        file: { name: fileData.meta.name, url: fileUrl },
        timestamp: fileData.meta.timestamp,
        status: 'received',
      }, senderName);
      
      this.fileChunks.delete(message.fileId);
    }
  }
  
  async handleMarkRead(data) {
    const { messageIds } = data;
    
    if (!this.currentTargetId) {
      return;
    }
    
    try {
      await this.sendMessageStatus('read', messageIds, this.currentTargetId);
    } catch (error) {
      console.warn('Failed to mark messages as read:', error);
    }
  }
  
  async sendMessageStatus(status, messageIds, targetId) {
    try {
      await this.webrtcService.sendMessage({
        type: 'message-status',
        status,
        messageIds,
      });
    } catch (error) {
      console.warn('Failed to send message status:', error);
    }
  }
  
  handleMessageStatusUpdate(data) {
    const { status, messageIds } = data;
    
    messageIds.forEach(messageId => {
      this.updateMessageStatus(messageId, status);
    });
  }
  
  handleTypingIndicator(senderId, isTyping) {
    if (senderId === this.currentTargetId) {
      eventBus.emit('ui:typing-indicator', { isTyping });
    }
  }
  
  async addMessageToDiscussion(message, senderName) {
    const discussion = await this.storageService.loadDiscussion(this.currentTargetId);
    
    discussion.messages.push({
      ...message,
      sender: senderName,
    });
    
    await this.storageService.saveDiscussion(this.currentTargetId, discussion);
    
    // Update state
    stateManager.dispatch('ADD_MESSAGE', {
      chatId: this.currentTargetId,
      message: { ...message, sender: senderName },
    });
    
    // Render messages
    this.renderMessages(discussion);
  }
  
  async loadMessages(targetId) {
    try {
      const discussion = await this.storageService.loadDiscussion(targetId);
      this.renderMessages(discussion);
    } catch (error) {
      console.warn('Failed to load messages:', error);
    }
  }
  
  renderMessages(discussion) {
    const messagesContainer = document.getElementById('messagesContainer');
    if (!messagesContainer) return;
    
    const allItems = [
      ...discussion.messages.map(item => ({ ...item, itemType: 'message' })),
      ...discussion.calls.map(item => ({ ...item, itemType: 'call' })),
    ];
    
    allItems.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    const itemsHtml = allItems.map(item => this.renderMessageItem(item)).join('');
    
    messagesContainer.innerHTML = itemsHtml;
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
  
  renderMessageItem(item) {
    if (item.itemType === 'message') {
      return this.renderMessage(item);
    } else if (item.itemType === 'call') {
      return this.renderCallRecord(item);
    }
    return '';
  }
  
  renderMessage(message) {
    const time = formatTime(message.timestamp);
    const isOwn = message.sender === 'You';
    
    const statusIcon = isOwn ? this.getStatusIcon(message.status) : '';
    
    let content = '';
    if (message.text) {
      content = `<span class="text-sm">${this.escapeHtml(message.text)}</span>`;
    } else if (message.audioUrl) {
      content = `<audio controls src="${message.audioUrl}"></audio>`;
    } else if (message.file) {
      content = `<a href="${message.file.url}" download="${message.file.name}" class="text-blue-300 hover:underline">${this.escapeHtml(message.file.name)}</a>`;
    }
    
    return `
      <div class="flex ${isOwn ? 'justify-end' : 'justify-start'}">
        <div class="bg-${isOwn ? 'green' : 'gray'}-700 px-4 py-2 rounded-lg max-w-xs">
          ${content}
          <div class="text-xs text-gray-400 text-right mt-1">
            ${time}
            ${statusIcon}
          </div>
        </div>
      </div>
    `;
  }
  
  renderCallRecord(call) {
    const time = formatTime(call.timestamp);
    const duration = call.status === 'ended' ? `(${formatDuration(call.duration)})` : '';
    
    return `
      <div class="text-center text-gray-500 text-xs my-2">
        ${call.type === 'video' ? 'Video' : 'Voice'} Call ${call.status} ${duration} - ${time}
      </div>
    `;
  }
  
  getStatusIcon(status) {
    switch (status) {
      case 'read':
        return '<i class="fas fa-check-double text-blue-400"></i>';
      case 'delivered':
        return '<i class="fas fa-check-double"></i>';
      case 'sent':
        return '<i class="fas fa-check"></i>';
      default:
        return '';
    }
  }
  
  updateMessageStatus(messageId, status) {
    // Update in storage
    this.storageService.loadDiscussion(this.currentTargetId).then(discussion => {
      const message = discussion.messages.find(m => m.id === messageId);
      if (message) {
        message.status = status;
        this.storageService.saveDiscussion(this.currentTargetId, discussion);
        this.renderMessages(discussion);
      }
    });
  }
  
  async markMessagesAsRead(targetId) {
    try {
      const discussion = await this.storageService.loadDiscussion(targetId);
      const unreadMessages = discussion.messages.filter(
        m => m.sender !== 'You' && m.status !== 'read'
      );
      
      if (unreadMessages.length > 0) {
        const messageIds = unreadMessages.map(m => m.id);
        
        // Update local status
        unreadMessages.forEach(m => m.status = 'read');
        await this.storageService.saveDiscussion(targetId, discussion);
        
        // Send read confirmation
        await this.sendMessageStatus('read', messageIds, targetId);
        
        this.renderMessages(discussion);
      }
    } catch (error) {
      console.warn('Failed to mark messages as read:', error);
    }
  }
  
  updateChatHeader(targetName) {
    const chatWithElement = document.getElementById('chatWith');
    if (chatWithElement) {
      chatWithElement.textContent = `Chatting with: ${targetName}`;
    }
  }
  
  // Utility methods
  arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  
  base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }
  
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  getCurrentTargetId() {
    return this.currentTargetId;
  }
  
  getCurrentTargetName() {
    return this.currentTargetName;
  }
  
  isCurrentlyTyping() {
    return this.isTyping;
  }
  
  cleanup() {
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
    
    if (this.mediaRecorder) {
      this.mediaRecorder.stop();
    }
    
    this.currentTargetId = null;
    this.currentTargetName = null;
    this.isTyping = false;
    this.fileChunks = null;
  }
}