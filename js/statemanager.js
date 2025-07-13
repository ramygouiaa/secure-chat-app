// js/statemanager.js

export class StateManager {
  constructor(emitter) {
    // Store emitter instance
    this.emitter = emitter;
    this.clientId = null;
    this.userName = null;
    this.currentTargetId = null;
    this.currentTargetName = null;
    this.peers = {}; // clientId -> { name, status } - simplified list for quick lookup
    this.allPeers = []; // Full list from signaling server
    this.discussions = {}; // targetId -> { messages: [], calls: [] }
    this.sharedSecrets = {}; // targetId -> shared secret (CryptoKey)
    this.myKeys = null; // My generated crypto keys (CryptoKeyPair)
    this.incomingOffer = null; // Stored offer for incoming calls
    this.callInitiatorId = null; // ID of the user initiating the current incoming call
    this.isVideoCall = false; // Flag for current call type
    this.callStartTime = null; // Timestamp when a call starts
    this.isRelayActive = false; // Flag indicating if relay is being used
    this.forceRelay = false; // User preference to force relay
    this.manualStatusOverride = false; // Flag if user manually set status

    // State related to media/messaging
    this.typingTimeout = null;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.fileChunks = new Map(); // fileId -> { chunks: [], meta: {} }
    this.localStream = null; // Local media stream

    // WebRTC related state
    this.localConnection = null;
    this.dataChannel = null;
    this.iceCandidateQueues = {}; // senderId -> [candidates]
  }

  // --- Getters ---
  getClientId() {
    return this.clientId;
  }

  getUserName() {
    return this.userName;
  }

  getCurrentTargetId() {
    return this.currentTargetId;
  }

  getCurrentTargetName() {
    return this.currentTargetName;
  }

  getPeer(id) {
    return this.peers[id];
  }

  getPeerName(id) {
    return this.peers[id]?.name || "Unknown";
  }

  getAllPeers() {
    return this.allPeers;
  }

  getDiscussion(peerId) {
    // Load from sessionStorage if not in memory
    if (!this.discussions[peerId]) {
      const discussion = sessionStorage.getItem(peerId);
      this.discussions[peerId] = discussion
        ? JSON.parse(discussion)
        : { messages: [], calls: [] };
    }
    return this.discussions[peerId];
  }

  getSharedSecret(targetId) {
    return this.sharedSecrets[targetId];
  }

  getMyKeys() {
    return this.myKeys;
  }

  getIncomingOffer() {
    return this.incomingOffer;
  }

  getCallInitiatorId() {
    return this.callInitiatorId;
  }

  getIsVideoCall() {
    return this.isVideoCall;
  }

  getCallStartTime() {
    return this.callStartTime;
  }

  getIsRelayActive() {
    return this.isRelayActive;
  }

  getForceRelay() {
    return this.forceRelay;
  }

  getManualStatusOverride() {
    return this.manualStatusOverride;
  }

  getTypingTimeout() {
    return this.typingTimeout;
  }

  getMediaRecorder() {
    return this.mediaRecorder;
  }

  getRecordedChunks() {
    return this.recordedChunks;
  }

  getFileChunks() {
    return this.fileChunks;
  }

  getLocalStream() {
    return this.localStream;
  }

  getLocalConnection() {
    return this.localConnection;
  }

  getDataChannel() {
    return this.dataChannel;
  }

  getIceCandidateQueue(id) {
    return this.iceCandidateQueues[id] || [];
  }

  setCurrentTarget(id, name) {
    this.currentTargetId = id;
    this.currentTargetName = name;
  }

  setSharedSecret(targetId, secret) {
    this.sharedSecrets[targetId] = secret;
  }

  setMyKeys(keys) {
    this.myKeys = keys;
  }

  setIncomingOffer(offer) {
    this.incomingOffer = offer;
  }

  // --- Basic Setters ---
  setClientId(id) {
    this.clientId = id;
  }

  setUserName(name) {
    this.userName = name;
  }

  setCallInitiatorId(id) {
    this.callInitiatorId = id;
  }

  setIsVideoCall(isVideo) {
    this.isVideoCall = isVideo;
  }

  setCallStartTime(time) {
    this.callStartTime = time;
  }

  setIsRelayActive(isActive) {
    this.isRelayActive = isActive;
  }

  setForceRelay(force) {
    this.forceRelay = force;
  }

  setManualStatusOverride(override) {
    this.manualStatusOverride = override;
  }

  setTypingTimeout(timeout) {
    this.typingTimeout = timeout;
  }

  setMediaRecorder(recorder) {
    this.mediaRecorder = recorder;
  }

  setRecordedChunks(chunks) {
    this.recordedChunks = chunks;
  }

  addRecordedChunk(chunk) {
    this.recordedChunks.push(chunk);
  }

  setFileChunks(map) {
    this.fileChunks = map;
  }

  setLocalStream(stream) {
    this.localStream = stream;
  }

  setLocalConnection(connection) {
    this.localConnection = connection;
  }

  addIceCandidateToQueue(id, candidate) {
    if (!this.iceCandidateQueues[id]) {
      this.iceCandidateQueues[id] = [];
    }
    this.iceCandidateQueues[id].push(candidate);
  }

  clearIceCandidateQueue(id) {
    delete this.iceCandidateQueues[id];
  }

  // --- Discussion Management ---
  _saveDiscussion(peerId, discussion) {
    this.discussions[peerId] = discussion; // Update in memory
    sessionStorage.setItem(peerId, JSON.stringify(discussion)); // Persist to session storage
  }

  addMessageToDiscussion(peerId, message) {
    const discussion = this.getDiscussion(peerId);
    discussion.messages.push(message); // Assuming discussion object exists from getDiscussion
    this._saveDiscussion(peerId, discussion);
  }

  addCallToDiscussion(peerId, callDetails) {
    const discussion = this.getDiscussion(peerId);
    discussion.calls.push(callDetails);
    this._saveDiscussion(peerId, discussion); // Use internal save method
  }

  findMessageInDiscussion(peerId, messageId) {
    const discussion = this.getDiscussion(peerId);
    return discussion.messages.find((m) => m.id === messageId);
  }

  // --- Peer List Management ---
  updatePeerList(peerArray) {
    this.allPeers = peerArray; // Update the full list
    this.peers = peerArray.reduce((acc, peer) => {
      acc[peer.id] = { name: peer.name, status: peer.status }; // Store simplified info
      // Ensure discussion object exists for new peers
      if (!sessionStorage.getItem(peer.id)) {
        // Initialize discussion for a new peer
        const newDiscussion = { messages: [], calls: [] };
        this.discussions[peer.id] = newDiscussion; // Add to in-memory cache
        // No need to save to sessionStorage immediately, getDiscussion will load if needed
        // Or we could save here if we want it to be persistent across page reloads
        // sessionStorage.setItem(peer.id, JSON.stringify(newDiscussion));
        console.log(`Initialized discussion for new peer: ${peer.id}`); // Optional: log
      }
      return acc;
    }, {});
  }

  // --- Reset Methods ---
  resetCallState() {
    this.incomingOffer = null;
    this.callInitiatorId = null;
    this.isVideoCall = false;
    this.callStartTime = null;
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
    if (this.localConnection) {
      this.localConnection.close();
      this.localConnection = null;
    }
    this.dataChannel = null;
  }

  resetTypingTimeout() {
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
      this.typingTimeout = null;
    }
  }

  resetMediaRecorder() {
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }
    this.mediaRecorder = null;
    this.recordedChunks = [];
  }

  // Methods related to DataChannel state, likely managed by WebRTCConnection but state held here
  setDataChannel(channel) {
    this.dataChannel = channel;
  }
}
