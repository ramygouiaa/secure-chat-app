// js/app.js

import { UIController } from "./ui.js";
import { StateManager } from "./statemanager.js";
import { SignalingClient } from "./signaling.js";
import { WebRTCConnection } from "./webrtc.js";
import { DataManager } from "./datamanager.js";
import { MediaManager } from "./mediamanager.js"; // Corrected path
import {
  generateKeys,
  exportPublicKey,
  importPublicKey,
  deriveSharedSecret,
  encryptMessage,
  decryptMessage,
} from "./e2ee.js";
import { arrayBufferToBase64, base64ToUint8Array } from "./utils.js";
import { EventEmitter } from "./events.js";

export class App {
  constructor() {
    this.state = new StateManager(this.emitter); // Pass emitter to StateManager
    this.emitter = new EventEmitter();
    this.ui = new UIController(this.emitter);
    this.signaling = new SignalingClient(this.state, this.emitter);
    this.webrtc = new WebRTCConnection(
      this.signalingClient,
      this.state,
      this.uiController,
      this.emitter
    ); // Corrected constructor arguments for WebRTCConnection
    this.dataManager = new DataManager(
      this.state,
      this.webrtc,
      this.signaling,
      this.ui, // Pass ui instance, not object with encrypt/decrypt
      this.emitter
    ); // Data depends on state, WebRTC, Signaling, E2EE, Utils, and Emitter // Corrected DataManager instantiation
    this.mediaManager = new MediaManager(
      this.state,
      this.ui,
      this.signaling,
      this.webrtc,
      this.emitter
    ); // Media depends on state, UI, Signaling, WebRTC, and Emitter
  }

  async start() {
    // Show welcome modal on page load
    this.ui.showWelcomeModal();

    // Attach UI event listeners, passing App methods as handlers
    this.ui.attachEventListeners({
      // UIController will now emit events instead of calling handlers directly
      onSendMessage: () => this.emitter.emit("ui:sendMessage"),
      onToggleRecording: () => this.emitter.emit("ui:toggleRecording"),
      onFileSelect: (event) => this.emitter.emit("ui:fileSelect", { event }),
      onInitiateVoiceCall: () => this.emitter.emit("ui:initiateVoiceCall"),
      onInitiateVideoCall: () => this.emitter.emit("ui:initiateVideoCall"),
      onHangUp: () => this.emitter.emit("ui:hangUp"),
      onToggleMute: () => this.emitter.emit("ui:toggleMute"),
      onAnswerCall: () => this.emitter.emit("ui:answerCall"),
      onDeclineCall: () => this.emitter.emit("ui:declineCall"),
      onStatusChange: (status) =>
        this.emitter.emit("ui:statusChange", { status }),
      onEnterChat: () => this.emitter.emit("ui:enterChat"),
      onForceRelayToggle: (isChecked) =>
        this.emitter.emit("ui:forceRelayToggle", { isChecked }),
      onContactSearch: (event) =>
        this.emitter.emit("ui:contactSearch", { event }),
      onTyping: () => this.emitter.emit("ui:typing"),
    });

    // Attach other global event listeners
    document.addEventListener(
      "visibilitychange",
      this.handleVisibilityChange.bind(this)
    );

    // Listen for events from other modules
    this.emitter.on("signaling:init", this.handleSignalingInit.bind(this));
    this.emitter.on("signaling:peer-list", this.handlePeerList.bind(this));
    this.emitter.on("signaling:offer", ({ offer, fromId }) =>
      this.webrtc.handleOffer(offer, fromId)
    );
    this.emitter.on("signaling:answer", ({ answer, fromId }) =>
      this.webrtc.handleAnswer(answer, fromId)
    );
    this.emitter.on("signaling:relay-key-exchange", ({ key, fromId }) =>
      this.dataManager.handleRelayKeyExchange(key, fromId)
    ); // DataManager handles key exchange
    this.emitter.on("signaling:relay-key-exchange-ack", ({ fromId }) =>
      this.dataManager.handleRelayKeyExchangeAck(fromId)
    ); // DataManager handles key exchange ack
    this.emitter.on("signaling:ice-candidate", ({ candidate, fromId }) =>
      this.webrtc.handleIceCandidate(candidate, fromId)
    );
    this.emitter.on("signaling:relay-message", ({ message, fromId }) =>
      this.dataManager.handleIncomingRelayedMessage(message, fromId)
    ); // DataManager handles relay messages
    this.emitter.on("signaling:call-offer", ({ offer, fromId, isVideo }) =>
      this.mediaManager.handleCallOffer(offer, fromId, isVideo)
    ); // MediaManager handles call offer
    this.emitter.on("signaling:call-answer", ({ answer, fromId }) =>
      this.mediaManager.handleCallAnswer(answer, fromId)
    ); // MediaManager handles call answer
    this.emitter.on("signaling:hang-up", ({ fromId }) =>
      this.mediaManager.handleHangUp(fromId, false)
    ); // MediaManager handles hang up
    this.emitter.on("signaling:decline-call", ({ fromId }) =>
      this.mediaManager.handleDeclineCall(fromId)
    );
    this.emitter.on(
      "signaling:message-status",
      ({ messageId, status, fromId }) =>
        this.dataManager.handleIncomingMessageStatus(messageId, status, fromId)
    );
    this.emitter.on("signaling:typing", ({ fromId, isTyping }) =>
      this.dataManager.handleTypingIndicator(fromId, isTyping)
    );

    this.emitter.on(
      "webrtc:datachannel-open",
      this.handleDataChannelOpen.bind(this)
    );
    this.emitter.on("webrtc:datachannel-message", ({ data, fromId }) =>
      this.dataManager.handleIncomingDataChannelMessage(data, fromId)
    );
    this.emitter.on("webrtc:connection-state-change", ({ state, peerId }) =>
      this.ui.updateConnectionStatus(
        `${state} ${peerId ? "with " + this.state.getPeerName(peerId) : ""}`
      )
    );
    this.emitter.on("webrtc:ice-candidate", ({ candidate, peerId }) =>
      this.signaling.sendIceCandidate(candidate, peerId)
    );
    this.emitter.on("webrtc:offer-created", ({ offer, peerId }) =>
      this.signaling.sendOffer(offer, peerId)
    );
    this.emitter.on("webrtc:answer-created", ({ answer, peerId }) =>
      this.signaling.sendAnswer(answer, peerId)
    );
    this.emitter.on("webrtc:track-received", ({ stream, type }) => {
      if (type === "video") {
        this.ui.setRemoteVideo(stream);
      } else if (type === "audio") {
        this.ui.setRemoteAudio(stream);
      }
    });
    this.emitter.on(
      "webrtc:fallback-to-relay",
      this.handleFallbackToRelay.bind(this)
    );
    this.emitter.on("webrtc:p2p-connected", ({ peerId }) =>
      this.ui.updateConnectionStatus(
        `Connected (WebRTC) with ${this.state.getPeerName(peerId)}`
      )
    );
    this.emitter.on("webrtc:disconnected", ({ peerId }) => {
      this.ui.updateConnectionStatus(
        `Disconnected from ${this.state.getPeerName(peerId)}`
      );
      // Consider attempting reconnect or falling back to relay here if not already active
    });

    this.emitter.on("data:message-updated", ({ peerId }) => {
      // DataManager tells App that messages for a peer have been updated
      if (peerId === this.state.getCurrentTargetId()) {
        this.ui.renderMessages(
          this.state.getDiscussion(peerId).messages,
          this.state.getClientId()
        );
      }
    });
    this.emitter.on("data:typing-update", ({ peerId, isTyping }) => {
      if (peerId === this.state.getCurrentTargetId()) {
        this.ui.updateConnectionStatus(
          isTyping
            ? `Typing...`
            : this.state.isRelayActive()
            ? `Connected (Relay) with ${this.state.getCurrentTargetName()}`
            : `Connected (WebRTC) with ${this.state.getCurrentTargetName()}`
        );
      }
    });
    this.emitter.on("data:show-notification", ({ message, type }) =>
      this.ui.showNotification(message, type)
    ); // UI handles showing notifications

    this.emitter.on("media:local-stream-ready", ({ stream }) =>
      this.ui.setLocalVideo(stream)
    );
    this.emitter.on("media:call-started", ({ isVideo }) => {
      if (isVideo) {
        this.ui.showVideoCallDialog();
      } else {
        this.ui.showVoiceCallControls(); // Need a UI method for this
      }
      this.ui.setMuteButtonState(false); // Start unmuted
      this.ui.updateConnectionStatus("In call");
    });
    this.emitter.on("media:incoming-call", ({ callerName, isVideo }) => {
      this.ui.showIncomingCallModal(callerName, isVideo);
    });
    this.emitter.on("media:call-answered", () => {
      this.ui.hideIncomingCallModal();
      this.ui.showNotification("Call connected!", "info");
    });
    this.emitter.on("media:call-ended", ({ peerId, callLog }) => {
      this.state.addCallToDiscussion(peerId, callLog);
      this.ui.renderMessages(
        this.state.getDiscussion(this.state.getCurrentTargetId()).messages,
        this.state.getClientId()
      );
      this.ui.hideVideoCallDialog();
      // Assume UIController has a method to hide voice call controls
      // this.ui.hideVoiceCallControls();
      this.ui.setLocalVideo(null); // Stop showing local video on hang up
      this.ui.setRemoteVideo(null);
      this.ui.setRemoteAudio(null);
      this.mediaManager.stopLocalStream(); // Stop the local media stream
      if (this.webrtc.getConnectionState() !== "disconnected") {
        this.webrtc.closeConnection(); // Close the WebRTC connection
      }
      this.ui.showNotification("Call ended.", "info");
      this.ui.updateConnectionStatus(
        this.state.isRelayActive() ? "Connected (Relay)" : "Connected (WebRTC)"
      );
    });
    this.emitter.on("media:show-notification", ({ message, type }) =>
      this.ui.showNotification(message, type)
    );
    this.emitter.on("media:play-sound", ({ soundElement, loopCount }) =>
      this.mediaManager.playAudioWithLoop(soundElement, loopCount)
    );
    this.emitter.on("media:stop-sound", ({ soundElement }) =>
      this.mediaManager.stopAudio(soundElement)
    );
    this.emitter.on("media:set-mute-button-state", ({ isMuted }) =>
      this.ui.setMuteButtonState(isMuted)
    );

    // UI Events
    this.emitter.on("ui:enterChat", this.handleEnterChat.bind(this));
    this.emitter.on("ui:contactClick", ({ peerId, peerName }) =>
      this.handleContactClick(peerId, peerName)
    );
    this.emitter.on("ui:sendMessage", () => this.dataManager.sendMessage());
    this.emitter.on("ui:toggleRecording", () =>
      this.dataManager.toggleRecording()
    );
    this.emitter.on("ui:fileSelect", ({ event }) =>
      this.dataManager.handleFileSelect(event)
    );
    this.emitter.on("ui:initiateVoiceCall", () =>
      this.mediaManager.initiateCall(false)
    );
    this.emitter.on("ui:initiateVideoCall", () =>
      this.mediaManager.initiateCall(true)
    );
    this.emitter.on("ui:hangUp", () => this.mediaManager.hangUp(true)); // 'true' because UI hang-up is initiator
    this.emitter.on("ui:toggleMute", () => this.mediaManager.toggleMute());
    this.emitter.on("ui:answerCall", () => this.mediaManager.answerCall());
    this.emitter.on("ui:declineCall", () => this.mediaManager.declineCall());
    this.emitter.on("ui:statusChange", ({ status }) =>
      this.handleStatusChange(status)
    );
    this.emitter.on("ui:forceRelayToggle", ({ isChecked }) =>
      this.handleForceRelayToggle(isChecked)
    );
    this.emitter.on("ui:contactSearch", ({ event }) =>
      this.handleContactSearch(event)
    );
    this.emitter.on("ui:typing", () => this.dataManager.handleTyping());
  }

  async handleEnterChat() {
    this.ui.hideWelcomeModal();
    const userName = prompt("Enter your name:");
    if (!userName) {
      alert("A name is required to join the chat.");
      return;
    }
    this.state.setUserName(userName);
    this.ui.setDisplayName(userName);

    // Generate keys and connect to signaling server
    this.state.setMyKeys(await generateKeys()); // Access generateKeys directly as it's imported at the top level
    console.log("Generated crypto keys.");

    this.signaling.connect(); // Signaling client will handle its connection logic
  }

  handleSignalingInit(clientId) {
    this.state.setClientId(clientId);
    this.ui.setClientId(clientId);
    this.signaling.register(this.state.getUserName()); // Signaling client registers with the server
  }

  handlePeerList(peers) {
    this.state.updatePeerList(peers);
    this.ui.updateContactList(
      this.state.getAllPeers(),
      this.state.getClientId(),
      this.state.getCurrentTargetId(),
      this.state.getContactSearchTerm()
    ); // Pass current target ID and search term
    // Ensure discussions are initialized for new peers
    peers.forEach((peer) => {
      if (
        peer.id !== this.state.getClientId() &&
        !this.state.getDiscussion(peer.id)
      ) {
        this.state.saveDiscussion(peer.id, { messages: [], calls: [] });
      }
    });
  }

  handleStatusChange(status) {
    this.state.setManualStatusOverride(status !== "Online");
    this.signaling.sendStatusUpdate(status);
  }

  handleForceRelayToggle(isChecked) {
    this.state.setForceRelay(isChecked);
    this.ui.showNotification(
      `Forced relay is now ${isChecked ? "ON" : "OFF"}. Reconnect to apply.`,
      "info"
    );
    if (this.state.getCurrentTargetId()) {
      // Re-establish connection with the new setting
      this.webrtc.createConnection(this.state.getCurrentTargetId());
    }
  }

  handleContactSearch(event) {
    const searchTerm = event.target.value;
    this.state.setContactSearchTerm(searchTerm);
    this.ui.updateContactList(
      this.state.getAllPeers(),
      this.state.getClientId(),
      this.state.getCurrentTargetId(),
      searchTerm
    );
  }

  handleVisibilityChange() {
    if (this.state.isManualStatusOverride()) return;
    if (document.visibilityState === "visible") {
      this.signaling.sendStatusUpdate("Online");
      if (this.state.getCurrentTargetId()) {
        this.dataManager.markMessagesAsRead(this.state.getCurrentTargetId()); // DataManager handles marking as read
      }
    } else {
      this.signaling.sendStatusUpdate("Away");
    }
  }

  handleDataChannelOpen() {
    this.state.setIsRelayActive(false);
    this.ui.updateConnectionStatus("Connected (WebRTC)");
    // After data channel opens, process any queued ICE candidates
    if (this.state.getIceCandidateQueue(this.state.getCurrentTargetId())) {
      for (const candidate of this.state.getIceCandidateQueue(
        this.state.getCurrentTargetId()
      )) {
        this.webrtc.addIceCandidate(candidate); // WebRTC handles adding candidate
      }
      this.state.clearIceCandidateQueue(this.state.getCurrentTargetId());
    }
    this.ui.renderMessages(
      this.state.getDiscussion(this.state.getCurrentTargetId()).messages,
      this.state.getClientId()
    ); // Render messages after connection
  }

  handleFallbackToRelay() {
    if (this.state.isRelayActive() || this.state.isForceRelay()) return; // Don't fallback if already relay or forced
    this.state.setIsRelayActive(true);
    this.ui.updateConnectionStatus("Connected (Relay)");
    this.ui.showNotification(
      "WebRTC connection failed. Using relay server.",
      "warning"
    );
    this.webrtc.initiateRelayKeyExchange(
      this.state.getCurrentTargetId(),
      this.state.getMyPublicKey()
    ); // WebRTC initiates relay key exchange
  }

  // This method will be called by UIController when a contact is clicked
  handleContactClick(peerId, peerName) {
    this.state.setCurrentTarget(peerId, peerName);
    this.ui.setChatTarget(peerName);
    // Ensure discussion exists
    if (!this.state.getDiscussion(peerId)) {
      this.state.saveDiscussion(peerId, { messages: [], calls: [] });
    }
    this.ui.renderMessages(
      this.state.getDiscussion(peerId).messages,
      this.state.getClientId()
    );
    this.dataManager.markMessagesAsRead(peerId); // DataManager handles marking as read
    this.webrtc.createConnection(peerId); // WebRTC handles creating connection
  }
}
