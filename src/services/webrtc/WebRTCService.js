/**
 * WebRTC service for peer-to-peer communication
 * Follows Single Responsibility Principle
 */

import { ICommunicationService } from "../../core/interfaces.js";
import { eventBus } from "../../core/events/EventBus.js";
import { appConfig } from "../../core/config/AppConfig.js";

export class WebRTCService extends ICommunicationService {
  constructor(signalingService, encryptionService) {
    super();
    this.signalingService = signalingService;
    this.encryptionService = encryptionService;
    this.peerConnection = null;
    this.localStream = null;
    this.dataChannel = null;
  }

  async initialize() {
    this.setupSignalingHandlers();
  }

  setupSignalingHandlers() {
    eventBus.on("signaling:offer", this.handleOffer.bind(this));
    eventBus.on("signaling:answer", this.handleAnswer.bind(this));
    eventBus.on("signaling:ice-candidate", this.handleIceCandidate.bind(this));
  }

  async createPeerConnection() {
    const config = appConfig.get("webrtc");
    this.peerConnection = new RTCPeerConnection({
      iceServers: config.iceServers,
    });

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.signalingService.sendMessage({
          type: "ice-candidate",
          candidate: event.candidate,
        });
      }
    };

    this.peerConnection.ondatachannel = (event) => {
      this.setupDataChannel(event.channel);
    };
  }

  setupDataChannel(channel) {
    this.dataChannel = channel;

    this.dataChannel.onopen = () => {
      eventBus.emit("webrtc:connected");
    };

    this.dataChannel.onmessage = async (event) => {
      // Handle encrypted messages
      eventBus.emit("webrtc:message-received", event.data);
    };
  }

  async sendMessage(message) {
    if (this.dataChannel && this.dataChannel.readyState === "open") {
      this.dataChannel.send(message);
    }
  }

  async handleOffer(data) {
    await this.createPeerConnection();
    await this.peerConnection.setRemoteDescription(data.offer);

    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    this.signalingService.sendMessage({
      type: "answer",
      answer: answer,
    });
  }

  async handleAnswer(data) {
    await this.peerConnection.setRemoteDescription(data.answer);
  }

  async handleIceCandidate(data) {
    await this.peerConnection.addIceCandidate(data.candidate);
  }

  async destroy() {
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
    }
  }
}
