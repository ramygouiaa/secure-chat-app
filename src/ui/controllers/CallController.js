/**
 * Call controller managing voice and video calls
 * Follows Single Responsibility Principle
 */

import { IUIController } from "../../core/interfaces.js";
import { eventBus } from "../../core/events/EventBus.js";
import { stateManager } from "../../core/state/StateManager.js";
import { errorHandler } from "../../core/errors/ErrorHandler.js";
import { playAudioWithLoop, stopAudio } from "../../utils/helpers.js";
import { CallView } from "../views/CallView.js";

export class CallController extends IUIController {
  constructor(webrtcService, storageService) {
    super();
    this.webrtcService = webrtcService;
    this.storageService = storageService;
    this.view = new CallView();
    this.callState = null;
    this.callStartTime = null;
    this.incomingOffer = null;
    this.callInitiatorId = null;
    this.isVideoCall = false;
    this.localStream = null;
    this.remoteStream = null;
    this.isMuted = false;

    this.setupEventHandlers();
  }

  async render(data) {
    this.view.render(data);
  }

  async handleEvent(event) {
    switch (event.type) {
      case "call:initiate":
        await this.handleInitiateCall(event.data);
        break;
      case "call:answer":
        await this.handleAnswerCall();
        break;
      case "call:decline":
        await this.handleDeclineCall();
        break;
      case "call:hangup":
        await this.handleHangUp();
        break;
      case "call:mute":
        await this.handleMute();
        break;
      case "call:unmute":
        await this.handleUnmute();
        break;
      default:
        console.warn(`Unknown event type: ${event.type}`);
    }
  }

  setupEventHandlers() {
    // Listen for signaling events
    eventBus.on("signaling:call-offer", (data) => {
      this.handleCallOffer(data.data, data.from, data.type === "video-offer");
    });

    eventBus.on("signaling:call-answer", (data) => {
      this.handleCallAnswer(data.data);
    });

    eventBus.on("signaling:hang-up", () => {
      this.handleIncomingHangUp();
    });

    eventBus.on("signaling:decline-call", (data) => {
      this.handleCallDeclined(data.from);
    });

    // Listen for WebRTC events
    eventBus.on("webrtc:local-stream", (data) => {
      this.handleLocalStream(data.stream);
    });

    eventBus.on("webrtc:remote-stream", (data) => {
      this.handleRemoteStream(data.stream);
    });

    // Listen for UI events
    eventBus.on("ui:visibility-change", (data) => {
      if (data.visible && this.callState === "active") {
        this.updateCallUI();
      }
    });
  }

  async handleInitiateCall(data) {
    const { targetId, isVideo = false } = data;

    if (this.callState && this.callState !== "idle") {
      errorHandler.createUserError("Already in a call");
      return;
    }

    try {
      this.isVideoCall = isVideo;
      this.callState = "calling";
      this.callStartTime = new Date();

      // Update state
      stateManager.dispatch("SET_CALL_STATE", {
        state: "calling",
        targetId,
        isVideo,
        startTime: this.callStartTime,
      });

      // Update status
      this.updateUserStatus("In call");

      // Start call
      await this.webrtcService.initiateCall(targetId, isVideo);

      // Play dialing sound
      const dialingSound = document.getElementById("dialingSound");
      if (dialingSound) {
        playAudioWithLoop(dialingSound, 5);
      }

      // Render calling UI
      this.render({
        state: "calling",
      });

      eventBus.emit("call:initiated", { targetId, isVideo });
    } catch (error) {
      this.handleCallError("Failed to initiate call", error);
    }
  }

  async handleCallOffer(offer, fromId, isVideo) {
    if (this.callState && this.callState !== "idle") {
      // Already in a call, decline
      await this.webrtcService.sendDeclineCall(fromId);
      return;
    }

    this.incomingOffer = offer;
    this.callInitiatorId = fromId;
    this.isVideoCall = isVideo;
    this.callState = "incoming";

    // Update state
    stateManager.dispatch("SET_CALL_STATE", {
      state: "incoming",
      targetId: fromId,
      isVideo,
      offer,
    });

    // Play ringing sound
    const ringingSound = document.getElementById("ringingSound");
    if (ringingSound) {
      playAudioWithLoop(ringingSound, 5);
    }

    // Render incoming call UI
    this.render({
      state: "incoming",
      fromName: stateManager.getState().peers[fromId]?.name || "Unknown",
      isVideo,
    });

    eventBus.emit("call:incoming", { fromId, isVideo });
  }

  async handleAnswerCall() {
    if (!this.incomingOffer || !this.callInitiatorId) {
      errorHandler.createUserError("No incoming call to answer");
      return;
    }

    try {
      this.callState = "active";
      this.callStartTime = new Date();

      // Update state
      stateManager.dispatch("SET_CALL_STATE", {
        state: "active",
        targetId: this.callInitiatorId,
        isVideo: this.isVideoCall,
        startTime: this.callStartTime,
      });

      // Update status
      this.updateUserStatus("In call");

      // Stop ringing sound
      const ringingSound = document.getElementById("ringingSound");
      if (ringingSound) {
        stopAudio(ringingSound);
      }

      // Answer call
      await this.webrtcService.answerCall(
        this.incomingOffer,
        this.callInitiatorId,
        this.isVideoCall
      );

      // Render active call UI
      this.render({
        state: "active",
        isVideo: this.isVideoCall,
      });

      eventBus.emit("call:answered", {
        targetId: this.callInitiatorId,
        isVideo: this.isVideoCall,
      });
    } catch (error) {
      this.handleCallError("Failed to answer call", error);
    }
  }

  async handleDeclineCall() {
    if (!this.callInitiatorId) {
      return;
    }

    try {
      // Send decline message
      await this.webrtcService.sendDeclineCall(this.callInitiatorId);

      // Stop ringing sound
      const ringingSound = document.getElementById("ringingSound");
      if (ringingSound) {
        stopAudio(ringingSound);
      }

      // Reset state
      this.resetCallState();

      eventBus.emit("call:declined", { targetId: this.callInitiatorId });
    } catch (error) {
      console.warn("Failed to decline call:", error);
    }
  }

  async handleHangUp() {
    if (!this.callState || this.callState === "idle") {
      return;
    }

    try {
      const targetId = stateManager.getState().callState?.targetId;

      // Send hang up message
      await this.webrtcService.hangUpCall();

      // Stop all sounds
      this.stopAllAudio();

      // Record call
      await this.recordCall("ended");

      // Reset state
      this.resetCallState();

      eventBus.emit("call:ended", { targetId });
    } catch (error) {
      console.warn("Failed to hang up call:", error);
    }
  }

  async handleMute() {
    if (!this.localStream) {
      return;
    }

    try {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });

      this.isMuted = true;
      this.updateMuteButton();

      eventBus.emit("call:muted");
    } catch (error) {
      console.warn("Failed to mute call:", error);
    }
  }

  async handleUnmute() {
    if (!this.localStream) {
      return;
    }

    try {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });

      this.isMuted = false;
      this.updateMuteButton();

      eventBus.emit("call:unmuted");
    } catch (error) {
      console.warn("Failed to unmute call:", error);
    }
  }

  async handleCallAnswer(answer) {
    try {
      this.callState = "active";

      // Stop dialing sound
      const dialingSound = document.getElementById("dialingSound");
      if (dialingSound) {
        stopAudio(dialingSound);
      }

      // Update state
      stateManager.dispatch("SET_CALL_STATE", {
        state: "active",
        startTime: this.callStartTime,
      });

      // Render active call UI
      this.render({
        state: "active",
        isVideo: this.isVideoCall,
      });

      eventBus.emit("call:connected");
    } catch (error) {
      this.handleCallError("Failed to handle call answer", error);
    }
  }

  handleCallDeclined(fromId) {
    const peerName = stateManager.getState().peers[fromId]?.name || "Unknown";

    // Stop dialing sound
    const dialingSound = document.getElementById("dialingSound");
    if (dialingSound) {
      stopAudio(dialingSound);
    }

    // Reset state
    this.resetCallState();

    // Show notification
    eventBus.emit("notification:show", {
      message: `${peerName} declined the call`,
      type: "warning",
    });

    eventBus.emit("call:declined", { fromId });
  }

  handleIncomingHangUp() {
    // Stop all sounds
    this.stopAllAudio();

    // Record call if it was active
    if (this.callState === "active") {
      this.recordCall("ended");
    } else if (this.callState === "incoming") {
      this.recordCall("missed");
    }

    // Reset state
    this.resetCallState();

    eventBus.emit("call:ended-by-peer");
  }

  handleLocalStream(stream) {
    this.localStream = stream;
    this.view.setLocalStream(stream);
    eventBus.emit("call:local-stream-ready", { stream });
  }

  handleRemoteStream(stream) {
    this.remoteStream = stream;
    this.view.setRemoteStream(stream, this.isVideoCall);
    eventBus.emit("call:remote-stream-ready", { stream });
  }

  handleCallError(message, error) {
    console.error(message, error);

    // Stop all sounds
    this.stopAllAudio();

    // Reset state
    this.resetCallState();

    // Show error notification
    errorHandler.createWebRTCError(message, { error });

    eventBus.emit("call:error", { message, error });
  }

  updateMuteButton() {
    this.view.updateMuteButton(this.isMuted);
  }

  updateCallUI() {
    // Update any time-based UI elements
    if (this.callState === "active" && this.callStartTime) {
      const duration = Math.floor((new Date() - this.callStartTime) / 1000);
      // Update duration display if you have one
    }
  }

  updateUserStatus(status) {
    const manualStatusOverride =
      stateManager.getState().settings?.manualStatusOverride;
    if (!manualStatusOverride) {
      eventBus.emit("user:status-update", { status });
    }
  }

  async recordCall(status) {
    if (!this.callStartTime) {
      return;
    }

    try {
      const targetId = stateManager.getState().callState?.targetId;
      if (!targetId) {
        return;
      }

      const callEndTime = new Date();
      const duration = Math.round((callEndTime - this.callStartTime) / 1000);

      const callRecord = {
        type: this.isVideoCall ? "video" : "voice",
        status,
        duration: status === "ended" ? duration : 0,
        timestamp: callEndTime.toISOString(),
      };

      // Save to discussion
      const discussion = await this.storageService.loadDiscussion(targetId);
      discussion.calls.push(callRecord);
      await this.storageService.saveDiscussion(targetId, discussion);

      // Update state
      stateManager.dispatch("ADD_CALL_RECORD", {
        chatId: targetId,
        call: callRecord,
      });

      eventBus.emit("call:recorded", { targetId, callRecord });
    } catch (error) {
      console.warn("Failed to record call:", error);
    }
  }

  stopAllAudio() {
    const dialingSound = document.getElementById("dialingSound");
    const ringingSound = document.getElementById("ringingSound");

    if (dialingSound) stopAudio(dialingSound);
    if (ringingSound) stopAudio(ringingSound);
  }

  resetCallState() {
    this.callState = "idle";
    this.callStartTime = null;
    this.incomingOffer = null;
    this.callInitiatorId = null;
    this.isVideoCall = false;
    this.localStream = null;
    this.remoteStream = null;
    this.isMuted = false;

    // Clear video sources
    const localVideo = document.getElementById("localVideo");
    const remoteVideo = document.getElementById("remoteVideo");
    const remoteAudio = document.getElementById("remoteAudio");

    if (localVideo) localVideo.srcObject = null;
    if (remoteVideo) remoteVideo.srcObject = null;
    if (remoteAudio) remoteAudio.srcObject = null;

    // Update state
    stateManager.dispatch("SET_CALL_STATE", null);

    // Render idle state
    this.render({
      state: "idle",
    });
  }

  getCallState() {
    return {
      state: this.callState,
      isVideoCall: this.isVideoCall,
      startTime: this.callStartTime,
      duration: this.callStartTime
        ? Math.floor((new Date() - this.callStartTime) / 1000)
        : 0,
      isMuted: this.isMuted,
    };
  }

  isInCall() {
    return this.callState === "active";
  }

  isReceivingCall() {
    return this.callState === "incoming";
  }

  cleanup() {
    this.stopAllAudio();
    this.resetCallState();
  }
}
