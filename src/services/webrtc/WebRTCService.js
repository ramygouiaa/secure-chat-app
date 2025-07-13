/**
 * WebRTC service for peer-to-peer communication
 * Follows Single Responsibility Principle
 */

import { ICommunicationService } from '../../core/interfaces.js';
import { appConfig } from '../../core/config/AppConfig.js';
import { errorHandler } from '../../core/errors/ErrorHandler.js';
import { eventBus } from '../../core/events/EventBus.js';

export class WebRTCService extends ICommunicationService {
  constructor(signalingService, encryptionService) {
    super();
    this.signalingService = signalingService;
    this.encryptionService = encryptionService;
    this.config = appConfig.get('webrtc');
    
    this.peerConnection = null;
    this.dataChannel = null;
    this.localStream = null;
    this.connectionState = 'disconnected';
    this.isInitiator = false;
    this.currentTargetId = null;
    this.iceCandidateQueue = [];
    this.connectionTimeout = null;
    this.isRelayMode = false;
  }
  
  async initialize() {
    try {
      this.setupEventHandlers();
      console.log('WebRTC service initialized');
    } catch (error) {
      errorHandler.createWebRTCError('Failed to initialize WebRTC service', { error });
      throw error;
    }
  }
  
  async destroy() {
    this.clearConnectionTimeout();
    await this.closeConnection();
    this.removeEventHandlers();
  }
  
  async connect(targetId, isInitiator = true) {
    try {
      this.currentTargetId = targetId;
      this.isInitiator = isInitiator;
      
      // Check if we should use relay mode
      if (appConfig.get('settings.forceRelay')) {
        this.isRelayMode = true;
        await this.initiateRelayConnection(targetId);
        return;
      }
      
      // Create peer connection
      this.peerConnection = new RTCPeerConnection({
        iceServers: this.config.iceServers,
      });
      
      this.setupPeerConnectionHandlers();
      
      // Set connection timeout
      this.connectionTimeout = setTimeout(() => {
        if (this.connectionState !== 'connected') {
          console.warn('WebRTC connection timed out, falling back to relay');
          this.fallbackToRelay();
        }
      }, this.config.connectionTimeout);
      
      if (isInitiator) {
        this.createDataChannel();
        await this.createOffer();
      }
      
      this.connectionState = 'connecting';
      eventBus.emit('webrtc:connecting', { targetId });
      
    } catch (error) {
      errorHandler.createWebRTCError('Failed to connect to peer', { error, targetId });
      throw error;
    }
  }
  
  async disconnect() {
    this.clearConnectionTimeout();
    await this.closeConnection();
    this.connectionState = 'disconnected';
    eventBus.emit('webrtc:disconnected', { targetId: this.currentTargetId });
  }
  
  async sendMessage(message) {
    try {
      if (this.isRelayMode) {
        return this.sendRelayMessage(message);
      }
      
      if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
        throw new Error('Data channel not ready');
      }
      
      const encrypted = await this.encryptionService.encryptMessage(
        JSON.stringify(message),
        this.currentTargetId
      );
      
      this.dataChannel.send(encrypted);
      return true;
      
    } catch (error) {
      errorHandler.createWebRTCError('Failed to send message', { error, message });
      throw error;
    }
  }
  
  async sendRelayMessage(message) {
    try {
      const encrypted = await this.encryptionService.encryptMessage(
        JSON.stringify(message),
        this.currentTargetId
      );
      
      const base64Data = this.arrayBufferToBase64(encrypted);
      await this.signalingService.sendRelayMessage(base64Data, this.currentTargetId);
      return true;
      
    } catch (error) {
      errorHandler.createWebRTCError('Failed to send relay message', { error, message });
      throw error;
    }
  }
  
  async createOffer() {
    try {
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      
      const publicKey = await this.encryptionService.exportPublicKey();
      await this.signalingService.sendOffer(offer, publicKey, this.currentTargetId);
      
    } catch (error) {
      errorHandler.createWebRTCError('Failed to create offer', { error });
      throw error;
    }
  }
  
  async handleOffer(offer, fromId, publicKey) {
    try {
      this.currentTargetId = fromId;
      this.isInitiator = false;
      
      // Establish shared secret
      await this.encryptionService.establishSharedSecret(fromId, publicKey);
      
      // Create peer connection if not exists
      if (!this.peerConnection) {
        this.peerConnection = new RTCPeerConnection({
          iceServers: this.config.iceServers,
        });
        this.setupPeerConnectionHandlers();
      }
      
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      
      // Process queued ICE candidates
      this.processIceCandidateQueue();
      
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      
      const myPublicKey = await this.encryptionService.exportPublicKey();
      await this.signalingService.sendAnswer(answer, myPublicKey, this.currentTargetId);
      
      this.connectionState = 'connecting';
      eventBus.emit('webrtc:connecting', { targetId: fromId });
      
    } catch (error) {
      errorHandler.createWebRTCError('Failed to handle offer', { error, fromId });
      throw error;
    }
  }
  
  async handleAnswer(answer, fromId, publicKey) {
    try {
      // Establish shared secret
      await this.encryptionService.establishSharedSecret(fromId, publicKey);
      
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      
      // Process queued ICE candidates
      this.processIceCandidateQueue();
      
    } catch (error) {
      errorHandler.createWebRTCError('Failed to handle answer', { error, fromId });
      throw error;
    }
  }
  
  async handleIceCandidate(candidate, fromId) {
    try {
      if (this.peerConnection && this.peerConnection.remoteDescription) {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        // Queue the candidate for later processing
        this.iceCandidateQueue.push(candidate);
      }
    } catch (error) {
      errorHandler.createWebRTCError('Failed to handle ICE candidate', { error, fromId });
    }
  }
  
  createDataChannel() {
    if (!this.peerConnection) return;
    
    this.dataChannel = this.peerConnection.createDataChannel('chat', {
      ordered: true,
    });
    
    this.setupDataChannelHandlers();
  }
  
  setupPeerConnectionHandlers() {
    if (!this.peerConnection) return;
    
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.signalingService.sendIceCandidate(event.candidate, this.currentTargetId);
      }
    };
    
    this.peerConnection.ondatachannel = (event) => {
      this.dataChannel = event.channel;
      this.setupDataChannelHandlers();
    };
    
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection.connectionState;
      this.connectionState = state;
      
      console.log(`WebRTC connection state: ${state}`);
      
      switch (state) {
        case 'connected':
          this.clearConnectionTimeout();
          this.isRelayMode = false;
          eventBus.emit('webrtc:connected', { targetId: this.currentTargetId });
          break;
        case 'disconnected':
        case 'failed':
          console.warn('WebRTC connection failed, falling back to relay');
          this.fallbackToRelay();
          break;
        case 'closed':
          eventBus.emit('webrtc:disconnected', { targetId: this.currentTargetId });
          break;
      }
    };
    
    this.peerConnection.ontrack = (event) => {
      const stream = event.streams[0];
      eventBus.emit('webrtc:remote-stream', { stream, targetId: this.currentTargetId });
    };
  }
  
  setupDataChannelHandlers() {
    if (!this.dataChannel) return;
    
    this.dataChannel.onopen = () => {
      console.log('Data channel opened');
      this.connectionState = 'connected';
      eventBus.emit('webrtc:data-channel-open', { targetId: this.currentTargetId });
    };
    
    this.dataChannel.onmessage = async (event) => {
      try {
        const decrypted = await this.encryptionService.decryptMessage(
          event.data,
          this.currentTargetId
        );
        const message = JSON.parse(new TextDecoder().decode(decrypted));
        eventBus.emit('webrtc:message-received', { message, targetId: this.currentTargetId });
      } catch (error) {
        errorHandler.createWebRTCError('Failed to handle data channel message', { error });
      }
    };
    
    this.dataChannel.onclose = () => {
      console.log('Data channel closed');
      eventBus.emit('webrtc:data-channel-close', { targetId: this.currentTargetId });
    };
    
    this.dataChannel.onerror = (error) => {
      console.error('Data channel error:', error);
      errorHandler.createWebRTCError('Data channel error', { error });
    };
  }
  
  async initiateRelayConnection(targetId) {
    try {
      const publicKey = await this.encryptionService.exportPublicKey();
      await this.signalingService.sendRelayKeyExchange(publicKey, targetId);
      this.isRelayMode = true;
      this.connectionState = 'connected';
      eventBus.emit('webrtc:relay-connected', { targetId });
    } catch (error) {
      errorHandler.createWebRTCError('Failed to initiate relay connection', { error, targetId });
      throw error;
    }
  }
  
  async handleRelayKeyExchange(fromId, publicKey) {
    try {
      await this.encryptionService.establishSharedSecret(fromId, publicKey);
      
      const myPublicKey = await this.encryptionService.exportPublicKey();
      await this.signalingService.sendRelayKeyExchangeAck(myPublicKey, fromId);
      
      this.currentTargetId = fromId;
      this.isRelayMode = true;
      this.connectionState = 'connected';
      eventBus.emit('webrtc:relay-connected', { targetId: fromId });
    } catch (error) {
      errorHandler.createWebRTCError('Failed to handle relay key exchange', { error, fromId });
      throw error;
    }
  }
  
  async handleRelayKeyExchangeAck(fromId, publicKey) {
    try {
      await this.encryptionService.establishSharedSecret(fromId, publicKey);
      this.connectionState = 'connected';
      eventBus.emit('webrtc:relay-connected', { targetId: fromId });
    } catch (error) {
      errorHandler.createWebRTCError('Failed to handle relay key exchange ack', { error, fromId });
      throw error;
    }
  }
  
  async handleRelayMessage(data, fromId) {
    try {
      const binaryData = this.base64ToUint8Array(data);
      const decrypted = await this.encryptionService.decryptMessage(binaryData, fromId);
      const message = JSON.parse(new TextDecoder().decode(decrypted));
      eventBus.emit('webrtc:message-received', { message, targetId: fromId });
    } catch (error) {
      errorHandler.createWebRTCError('Failed to handle relay message', { error, fromId });
    }
  }
  
  async fallbackToRelay() {
    console.log('Falling back to relay mode');
    this.isRelayMode = true;
    this.connectionState = 'connected';
    eventBus.emit('webrtc:fallback-to-relay', { targetId: this.currentTargetId });
  }
  
  processIceCandidateQueue() {
    this.iceCandidateQueue.forEach(candidate => {
      this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
        .catch(error => {
          console.warn('Failed to add queued ICE candidate:', error);
        });
    });
    this.iceCandidateQueue = [];
  }
  
  async closeConnection() {
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    
    this.currentTargetId = null;
    this.isRelayMode = false;
    this.iceCandidateQueue = [];
  }
  
  clearConnectionTimeout() {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
  }
  
  setupEventHandlers() {
    // Handle signaling events
    this.unsubscribeHandlers = [
      eventBus.on('signaling:offer', (data) => this.handleOffer(data.data, data.from, data.publicKey)),
      eventBus.on('signaling:answer', (data) => this.handleAnswer(data.data, data.from, data.publicKey)),
      eventBus.on('signaling:ice-candidate', (data) => this.handleIceCandidate(data.data, data.from)),
      eventBus.on('signaling:relay-key-exchange', (data) => this.handleRelayKeyExchange(data.from, data.publicKey)),
      eventBus.on('signaling:relay-key-exchange-ack', (data) => this.handleRelayKeyExchangeAck(data.from, data.publicKey)),
      eventBus.on('signaling:relay', (data) => this.handleRelayMessage(data.payload, data.from)),
    ];
  }
  
  removeEventHandlers() {
    if (this.unsubscribeHandlers) {
      this.unsubscribeHandlers.forEach(unsubscribe => unsubscribe());
      this.unsubscribeHandlers = [];
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
  
  base64ToUint8Array(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  
  // Media handling methods
  async startMediaStream(constraints = { audio: true, video: false }) {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      if (this.peerConnection) {
        this.localStream.getTracks().forEach(track => {
          this.peerConnection.addTrack(track, this.localStream);
        });
      }
      
      eventBus.emit('webrtc:local-stream', { stream: this.localStream });
      return this.localStream;
    } catch (error) {
      errorHandler.createWebRTCError('Failed to start media stream', { error, constraints });
      throw error;
    }
  }
  
  async stopMediaStream() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
      eventBus.emit('webrtc:local-stream-stopped');
    }
  }
  
  // Call handling methods
  async initiateCall(targetId, isVideo = false) {
    try {
      const constraints = {
        audio: true,
        video: isVideo,
      };
      
      await this.startMediaStream(constraints);
      
      if (!this.peerConnection) {
        await this.connect(targetId, true);
      }
      
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      
      await this.signalingService.sendCallOffer(offer, targetId, isVideo);
      
      eventBus.emit('webrtc:call-initiated', { targetId, isVideo });
      
    } catch (error) {
      errorHandler.createWebRTCError('Failed to initiate call', { error, targetId, isVideo });
      throw error;
    }
  }
  
  async answerCall(offer, fromId, isVideo = false) {
    try {
      const constraints = {
        audio: true,
        video: isVideo,
      };
      
      await this.startMediaStream(constraints);
      
      if (!this.peerConnection) {
        this.peerConnection = new RTCPeerConnection({
          iceServers: this.config.iceServers,
        });
        this.setupPeerConnectionHandlers();
      }
      
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      
      await this.signalingService.sendCallAnswer(answer, fromId, isVideo);
      
      eventBus.emit('webrtc:call-answered', { targetId: fromId, isVideo });
      
    } catch (error) {
      errorHandler.createWebRTCError('Failed to answer call', { error, fromId, isVideo });
      throw error;
    }
  }
  
  async hangUpCall() {
    try {
      if (this.currentTargetId) {
        await this.signalingService.sendHangUp(this.currentTargetId);
      }
      
      await this.stopMediaStream();
      eventBus.emit('webrtc:call-ended', { targetId: this.currentTargetId });
      
    } catch (error) {
      errorHandler.createWebRTCError('Failed to hang up call', { error });
      throw error;
    }
  }
  
  // Status getters
  getConnectionState() {
    return {
      state: this.connectionState,
      isRelayMode: this.isRelayMode,
      targetId: this.currentTargetId,
      hasDataChannel: !!this.dataChannel,
      dataChannelState: this.dataChannel ? this.dataChannel.readyState : null,
    };
  }
  
  isConnected() {
    return this.connectionState === 'connected';
  }
  
  isInCall() {
    return !!this.localStream;
  }
}