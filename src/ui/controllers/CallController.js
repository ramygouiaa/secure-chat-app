/**
 * Call controller managing voice and video calls
 * Follows Single Responsibility Principle
 */

import { IUIController } from "../../core/interfaces.js";
import { eventBus } from "../../core/events/EventBus.js";

export class CallController extends IUIController {
  constructor(webrtcService, storageService) {
    super();
    this.webrtcService = webrtcService;
    this.storageService = storageService;
    this.currentCall = null;
    this.isInCall = false;
  }

  async initialize() {
    this.setupEventHandlers();
  }

  render(data) {
    // Render method for controller interface compatibility
    console.log("CallController render called with:", data);
  }

  setupEventHandlers() {
    eventBus.on("webrtc:call-received", this.handleIncomingCall.bind(this));
    eventBus.on("webrtc:call-accepted", this.handleCallAccepted.bind(this));
    eventBus.on("webrtc:call-rejected", this.handleCallRejected.bind(this));
    eventBus.on("webrtc:call-ended", this.handleCallEnded.bind(this));
  }

  async handleIncomingCall(data) {
    console.log("Incoming call from:", data.targetId);
    this.currentCall = { targetId: data.targetId, isVideo: data.isVideo };
  }

  async handleCallAccepted(data) {
    console.log("Call accepted:", data);
    this.isInCall = true;
  }

  async handleCallRejected(data) {
    console.log("Call rejected:", data);
    this.currentCall = null;
  }

  async handleCallEnded(data) {
    console.log("Call ended:", data);
    this.currentCall = null;
    this.isInCall = false;
  }

  async initiateCall(targetId, isVideo = false) {
    console.log(`Initiating ${isVideo ? "video" : "audio"} call to:`, targetId);
    this.currentCall = { targetId, isVideo };
  }

  handleEvent(event) {
    switch (event.type) {
      case "call:initiate":
        this.initiateCall(event.data.targetId, event.data.isVideo);
        break;
      case "call:answer":
        this.answerCall();
        break;
      case "call:decline":
        this.declineCall();
        break;
      case "call:hangup":
        this.hangUpCall();
        break;
      case "call:mute":
        this.muteCall();
        break;
      case "call:unmute":
        this.unmuteCall();
        break;
      default:
        console.warn("Unknown call event type:", event.type);
    }
  }

  async answerCall() {
    console.log("Answering call");
    // TODO: Implement call answer logic
  }

  async declineCall() {
    console.log("Declining call");
    this.currentCall = null;
  }

  async hangUpCall() {
    console.log("Hanging up call");
    this.currentCall = null;
    this.isInCall = false;
  }

  async muteCall() {
    console.log("Muting call");
    // TODO: Implement mute logic
  }

  async unmuteCall() {
    console.log("Unmuting call");
    // TODO: Implement unmute logic
  }

  getCallState() {
    return {
      isInCall: this.isInCall,
      isMuted: false, // TODO: Track actual mute state
      currentCall: this.currentCall,
    };
  }
}
