// js/webrtc.js

import { exportPublicKey, importPublicKey, deriveSharedSecret } from "./e2ee.js";
import { base64ToUint8Array } from "./utils.js";

// Define ICE servers within the WebRTC module
const ICE_SERVERS = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        // Add your TURN server here if needed
        // {
        //     urls: "turn:your_turn_server.com:3478",
        //     username: "your_username",
        //     credential: "your_password",
        // },
    ],
};

export class WebRTCConnection {
    constructor(signalingClient, stateManager, uiController, eventEmitter) {
        this.signalingClient = signalingClient;
        this.stateManager = stateManager;
        this.uiController = uiController;
        this.eventEmitter = eventEmitter; // Use an event emitter for communication

        this.localConnection = null;
        this.dataChannel = null;
        this.localStream = null;

        // Event listeners from SignalingClient
        this.signalingClient.on("offer", this.handleOffer.bind(this));
        this.signalingClient.on("answer", this.handleAnswer.bind(this));
        this.signalingClient.on("ice-candidate", this.handleICECandidate.bind(this));
        this.signalingClient.on("relay-key-exchange", this.handleRelayKeyExchange.bind(this));
        this.signalingClient.on("relay-key-exchange-ack", this.handleRelayKeyExchangeAck.bind(this));
        this.signalingClient.on("video-offer", (data, fromId) => this.handleCallOffer(data, fromId, true));
        this.signalingClient.on("voice-offer", (data, fromId) => this.handleCallOffer(data, fromId, false));
        this.signalingClient.on("video-answer", this.handleCallAnswer.bind(this));
        this.signalingClient.on("voice-answer", this.handleCallAnswer.bind(this));
        this.signalingClient.on("hang-up", this.handleHangUp.bind(this));
        this.signalingClient.on("decline-call", this.handleDeclineCall.bind(this));
    }

    createConnection() {
        const forceRelay = this.stateManager.getState().forceRelay;
        if (forceRelay) {
            this.activateRelayFallback();
            this.initiateRelayKeyExchange();
            return;
        }

        this.localConnection = new RTCPeerConnection(ICE_SERVERS);
        this.stateManager.setState({ isRelayActive: false }); // Reset relay state

        const connectionTimeout = setTimeout(() => {
            if (
                this.localConnection.connectionState !== "connected" &&
                this.localConnection.connectionState !== "completed"
            ) {
                console.warn("WebRTC connection timed out. Falling back to relay.");
                this.activateRelayFallback();
            }
        }, 15000); // 15-second timeout

        this.dataChannel = this.localConnection.createDataChannel("chat");
        this.setupDataChannel(this.dataChannel);

        this.localConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.signalingClient.sendSignalingMessage({
                    type: "ice-candidate",
                    data: event.candidate,
                    target: this.stateManager.getState().currentTargetId,
                });
            }
        };

        this.localConnection.ondatachannel = (event) => {
            this.setupDataChannel(event.channel);
        };

        this.localConnection.onconnectionstatechange = () => {
            this.uiController.updateConnectionStatus(this.localConnection.connectionState);
            if (
                this.localConnection.connectionState === "failed" ||
                this.localConnection.connectionState === "disconnected"
            ) {
                console.error("WebRTC connection failed. Falling back to relay.");
                this.activateRelayFallback();
            } else if (this.localConnection.connectionState === "connected") {
                clearTimeout(connectionTimeout);
                console.log("WebRTC connection established successfully.");
                this.stateManager.setState({ isRelayActive: false });
                this.uiController.updateConnectionStatus("Connected (WebRTC)");
                 // Notify DataManager that data channel is ready
                this.eventEmitter.emit('datachannel-ready', this.dataChannel);
            }
        };

        this.localConnection.ontrack = (event) => {
            const stream = event.streams[0];
            if (stream.getVideoTracks().length > 0) {
                this.uiController.setRemoteVideo(stream);
            } else {
                this.uiController.setRemoteAudio(stream);
            }
        };

        // Only create offer if we are the initiator (e.g., selecting a contact)
        // Offer creation will be triggered by the App or UI when a contact is selected
    }

     async createOffer() {
         if (!this.localConnection) {
             console.error("RTCPeerConnection not initialized.");
             return;
         }
         try {
             const offer = await this.localConnection.createOffer();
             await this.localConnection.setLocalDescription(offer);

             const exportedPublicKey = await exportPublicKey(this.stateManager.getState().myKeys.publicKey);
             this.signalingClient.sendSignalingMessage({
                 type: "offer",
                 data: this.localConnection.localDescription,
                 publicKey: exportedPublicKey,
                 target: this.stateManager.getState().currentTargetId,
             });
         } catch (error) {
             console.error("Error creating offer:", error);
         }
     }

    async handleAnswer(answer, fromId, publicKey) {
         const remotePublicKey = await importPublicKey(publicKey);
         const sharedSecret = await deriveSharedSecret(
             this.stateManager.getState().myKeys.privateKey,
             remotePublicKey
         );
         const sharedSecrets = this.stateManager.getState().sharedSecrets;
         sharedSecrets[fromId] = sharedSecret;
         this.stateManager.setState({ sharedSecrets });
         console.log(`Shared secret established with ${this.stateManager.getPeerName(fromId)}`);

         await this.localConnection.setRemoteDescription(new RTCSessionDescription(answer));

         // Process any queued ICE candidates
         const iceCandidateQueues = this.stateManager.getState().iceCandidateQueues;
         if (iceCandidateQueues[fromId]) {
             for (const candidate of iceCandidateQueues[fromId]) {
                 await this.localConnection.addIceCandidate(candidate);
             }
             delete iceCandidateQueues[fromId];
             this.stateManager.setState({ iceCandidateQueues });
         }
     }

     async handleOffer(offer, fromId, publicKey) {
         const forceRelay = this.stateManager.getState().forceRelay;
         if (forceRelay) {
             console.log("Ignoring WebRTC offer while in forced relay mode.");
             return;
         }
         this.stateManager.setState({ currentTargetId: fromId, currentTargetName: this.stateManager.getPeerName(fromId) });
         this.uiController.setChatTarget(this.stateManager.getState().currentTargetName);
         this.uiController.renderMessages(this.stateManager.getDiscussion(fromId).messages, this.stateManager.getState().clientId); // Render messages for the new target

         // If we already have a connection, close it before creating a new one
         if (this.localConnection) {
             this.localConnection.close();
         }

         this.localConnection = new RTCPeerConnection(ICE_SERVERS);
         this.stateManager.setState({ isRelayActive: false }); // Reset relay state

         this.localConnection.ondatachannel = (event) => this.setupDataChannel(event.channel);

         this.localConnection.ontrack = (event) => {
             const stream = event.streams[0];
             if (stream.getVideoTracks().length > 0) {
                 this.uiController.setRemoteVideo(stream);
             } else {
                 this.uiController.setRemoteAudio(stream);
             }
         };

         this.localConnection.onicecandidate = (event) => {
             if (event.candidate) {
                 this.signalingClient.sendSignalingMessage({
                     type: "ice-candidate",
                     data: event.candidate,
                     target: this.stateManager.getState().currentTargetId,
                 });
             }
         };

         await this.localConnection.setRemoteDescription(new RTCSessionDescription(offer));

         const remotePublicKey = await importPublicKey(publicKey);
         const sharedSecret = await deriveSharedSecret(
             this.stateManager.getState().myKeys.privateKey,
             remotePublicKey
         );
         const sharedSecrets = this.stateManager.getState().sharedSecrets;
         sharedSecrets[fromId] = sharedSecret;
         this.stateManager.setState({ sharedSecrets });
         console.log(`Shared secret established with ${this.stateManager.getPeerName(fromId)}`);

         const answer = await this.localConnection.createAnswer();
         await this.localConnection.setLocalDescription(answer);

         // Process any queued ICE candidates
         const iceCandidateQueues = this.stateManager.getState().iceCandidateQueues;
         if (iceCandidateQueues[fromId]) {
             for (const candidate of iceCandidateQueues[fromId]) {
                 await this.localConnection.addIceCandidate(candidate);
             }
             delete iceCandidateQueues[fromId];
              this.stateManager.setState({ iceCandidateQueues });
         }

         const exportedPublicKey = await exportPublicKey(this.stateManager.getState().myKeys.publicKey);
         this.signalingClient.sendSignalingMessage({
             type: "answer",
             data: answer,
             publicKey: exportedPublicKey,
             target: this.stateManager.getState().currentTargetId,
         });
     }

     handleICECandidate(candidate, fromId) {
         if (!this.localConnection || this.localConnection.remoteDescription === null) {
             // Queue candidates if the offer hasn't been processed yet
             const iceCandidateQueues = this.stateManager.getState().iceCandidateQueues;
             if (!iceCandidateQueues[fromId]) {
                 iceCandidateQueues[fromId] = [];
             }
             iceCandidateQueues[fromId].push(candidate);
             this.stateManager.setState({ iceCandidateQueues });
             return;
         }
         this.localConnection.addIceCandidate(new RTCIceCandidate(candidate)).catch((e) => {
             console.error("Error adding received ICE candidate:", e);
         });
     }

    setupDataChannel(channel) {
        this.dataChannel = channel;
        this.dataChannel.onopen = () => {
            this.uiController.updateConnectionStatus("Connected (WebRTC)");
            this.stateManager.setState({ isRelayActive: false });
            // Notify DataManager that data channel is ready
            this.eventEmitter.emit('datachannel-ready', this.dataChannel);
        };
        this.dataChannel.onmessage = (event) => {
            // Handle incoming messages via DataManager
             this.eventEmitter.emit('datachannel-message', event.data, this.stateManager.getState().currentTargetId);
        };
        this.dataChannel.onclose = () => {
            console.warn("Data channel closed.");
            // Consider if fallback is needed here or handled by connectionstatechange
        };
         this.dataChannel.onerror = (error) => {
            console.error("Data channel error:", error);
         };
    }

     activateRelayFallback() {
         if (this.stateManager.getState().isRelayActive) return; // Already active
         this.stateManager.setState({ isRelayActive: true });
         this.uiController.updateConnectionStatus("Connected (Relay)");
         this.uiController.showNotification("WebRTC connection failed. Using relay server.", "warning");
         // No need to close the localConnection, let it keep trying to connect
         this.initiateRelayKeyExchange(); // Initiate key exchange for relay
     }

     async initiateRelayKeyExchange() {
         const exportedPublicKey = await exportPublicKey(this.stateManager.getState().myKeys.publicKey);
         this.signalingClient.sendSignalingMessage({
             type: "relay-key-exchange",
             publicKey: exportedPublicKey,
             target: this.stateManager.getState().currentTargetId,
         });
     }

    async handleRelayKeyExchange(fromId, publicKey) {
         const remotePublicKey = await importPublicKey(publicKey);
         const sharedSecret = await deriveSharedSecret(
             this.stateManager.getState().myKeys.privateKey,
             remotePublicKey
         );
         const sharedSecrets = this.stateManager.getState().sharedSecrets;
         sharedSecrets[fromId] = sharedSecret;
         this.stateManager.setState({ sharedSecrets });
         console.log(`Shared secret established via relay with ${this.stateManager.getPeerName(fromId)}`);

         // Acknowledge the key exchange
         const exportedPublicKey = await exportPublicKey(this.stateManager.getState().myKeys.publicKey);
         this.signalingClient.sendSignalingMessage({
             type: "relay-key-exchange-ack",
             publicKey: exportedPublicKey,
             target: fromId,
         });
         this.uiController.updateConnectionStatus("Connected (Relay)");
          // Notify DataManager that relay is active and ready for messaging
         this.eventEmitter.emit('relay-ready', fromId);
     }

     async handleRelayKeyExchangeAck(fromId, publicKey) {
         const remotePublicKey = await importPublicKey(publicKey);
         const sharedSecret = await deriveSharedSecret(
             this.stateManager.getState().myKeys.privateKey,
             remotePublicKey
         );
         const sharedSecrets = this.stateManager.getState().sharedSecrets;
         sharedSecrets[fromId] = sharedSecret;
         this.stateManager.setState({ sharedSecrets });
         console.log(`Shared secret acknowledged via relay with ${this.stateManager.getPeerName(fromId)}`);
         this.uiController.updateConnectionStatus("Connected (Relay)");
          // Notify DataManager that relay is active and ready for messaging
         this.eventEmitter.emit('relay-ready', fromId);
     }

     // Call related methods will be added in MediaManager/CallManager
}
function createConnection() {
  if (forceRelay) {
    activateRelayFallback();
    initiateRelayKeyExchange();
    return;
  }
  localConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  isRelayActive = false; // Reset relay state on new connection

  const connectionTimeout = setTimeout(() => {
    if (
      localConnection.connectionState !== "connected" &&
      localConnection.connectionState !== "completed"
    ) {
      console.warn("WebRTC connection timed out. Falling back to relay.");
      activateRelayFallback();
    }
  }, 15000); // 15-second timeout

  dataChannel = localConnection.createDataChannel("chat");
  setupDataChannel(dataChannel);

  localConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.send(
        JSON.stringify({
          type: "ice-candidate",
          data: event.candidate,
          target: currentTargetId,
        })
      );
    }
  };

  localConnection.ondatachannel = (event) => {
    setupDataChannel(event.channel);
  };

  localConnection.onconnectionstatechange = () => {
    connectionStatus.textContent = localConnection.connectionState;
    if (
      localConnection.connectionState === "failed" ||
      localConnection.connectionState === "disconnected"
    ) {
      console.error("WebRTC connection failed. Falling back to relay.");
      activateRelayFallback();
    } else if (localConnection.connectionState === "connected") {
      clearTimeout(connectionTimeout);
      console.log("WebRTC connection established successfully.");
      isRelayActive = false;
      connectionStatus.textContent = "Connected (WebRTC)";
    }
  };

  localConnection.ontrack = (event) => {
    const stream = event.streams[0];
    if (stream.getVideoTracks().length > 0) {
      remoteVideo.srcObject = stream;
    } else {
      remoteAudio.srcObject = stream;
    }
  };

  localConnection
    .createOffer()
    .then((offer) => localConnection.setLocalDescription(offer))
    .then(async () => {
      const exportedPublicKey = await exportPublicKey(myKeys.publicKey);
      socket.send(
        JSON.stringify({
          type: "offer",
          data: localConnection.localDescription,
          publicKey: exportedPublicKey,
          target: currentTargetId,
        })
      );
    });
}

async function handleAnswer(answer, fromId, publicKey) {
  const remotePublicKey = await importPublicKey(publicKey);
  const sharedSecret = await deriveSharedSecret(
    myKeys.privateKey,
    remotePublicKey
  );
  sharedSecrets[fromId] = sharedSecret;
  console.log(`Shared secret established with ${peers[fromId]}`);
  await localConnection.setRemoteDescription(new RTCSessionDescription(answer));

  // Process any queued ICE candidates
  if (iceCandidateQueues[fromId]) {
    for (const candidate of iceCandidateQueues[fromId]) {
      await localConnection.addIceCandidate(candidate);
    }
    delete iceCandidateQueues[fromId];
  }
}

async function initiateRelayKeyExchange() {
  const exportedPublicKey = await exportPublicKey(myKeys.publicKey);
  socket.send(
    JSON.stringify({
      type: "relay-key-exchange",
      publicKey: exportedPublicKey,
      target: currentTargetId,
    })
  );
}

async function handleRelayKeyExchange(fromId, publicKey) {
  const remotePublicKey = await importPublicKey(publicKey);
  const sharedSecret = await deriveSharedSecret(
    myKeys.privateKey,
    remotePublicKey
  );
  sharedSecrets[fromId] = sharedSecret;
  console.log(`Shared secret established via relay with ${peers[fromId]}`);

  // Acknowledge the key exchange
  const exportedPublicKey = await exportPublicKey(myKeys.publicKey);
  socket.send(
    JSON.stringify({
      type: "relay-key-exchange-ack",
      publicKey: exportedPublicKey,
      target: fromId,
    })
  );
  connectionStatus.textContent = "Connected (Relay)";
  renderMessages(fromId);
}

async function handleRelayKeyExchangeAck(fromId, publicKey) {
  const remotePublicKey = await importPublicKey(publicKey);
  const sharedSecret = await deriveSharedSecret(
    myKeys.privateKey,
    remotePublicKey
  );
  sharedSecrets[fromId] = sharedSecret;
  console.log(`Shared secret acknowledged via relay with ${peers[fromId]}`);
  connectionStatus.textContent = "Connected (Relay)";
  renderMessages(fromId);
}

async function handleOffer(offer, fromId, publicKey) {
  if (forceRelay) {
    console.log("Ignoring WebRTC offer while in forced relay mode.");
    return;
  }
  currentTargetId = fromId;
  currentTargetName = peers[fromId];
  chatWith.textContent = "Chatting with: " + currentTargetName;

  localConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  localConnection.ondatachannel = (event) => setupDataChannel(event.channel);

  localConnection.ontrack = (event) => {
    const stream = event.streams[0];
    if (stream.getVideoTracks().length > 0) {
      remoteVideo.srcObject = stream;
    } else {
      remoteAudio.srcObject = stream;
    }
  };

  localConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.send(
        JSON.stringify({
          type: "ice-candidate",
          data: event.candidate,
          target: currentTargetId,
        })
      );
    }
  };

  await localConnection.setRemoteDescription(new RTCSessionDescription(offer));

  const remotePublicKey = await importPublicKey(publicKey);
  const sharedSecret = await deriveSharedSecret(
    myKeys.privateKey,
    remotePublicKey
  );
  sharedSecrets[fromId] = sharedSecret;
  console.log(`Shared secret established with ${peers[fromId]}`);

  const answer = await localConnection.createAnswer();
  await localConnection.setLocalDescription(answer);

  // Process any queued ICE candidates
  if (iceCandidateQueues[fromId]) {
    for (const candidate of iceCandidateQueues[fromId]) {
      await localConnection.addIceCandidate(candidate);
    }
    delete iceCandidateQueues[fromId];
  }

  const exportedPublicKey = await exportPublicKey(myKeys.publicKey);
  socket.send(
    JSON.stringify({
      type: "answer",
      data: answer,
      publicKey: exportedPublicKey,
      target: currentTargetId,
    })
  );
}

function setupDataChannel(channel) {
  dataChannel = channel;
  dataChannel.onopen = () => {
    connectionStatus.textContent = "Connected (WebRTC)";
    isRelayActive = false;
    renderMessages(currentTargetId);
  };
  dataChannel.onmessage = (event) => {
    handleIncomingMessage(event.data, currentTargetId);
  };
  dataChannel.onclose = () => {
    console.warn("Data channel closed.");
    // activateRelayFallback(); // Fallback if data channel closes unexpectedly
  };
}

function activateRelayFallback() {
  if (isRelayActive) return; // Already active
  isRelayActive = true;
  connectionStatus.textContent = "Connected (Relay)";
  showNotification("WebRTC connection failed. Using relay server.", "warning");
  // No need to close the localConnection, let it keep trying to connect
}

async function handleIncomingMessage(data, senderId) {
  try {
    let message;
    try {
      message = JSON.parse(new TextDecoder().decode(data));
    } catch (error) {
      const decryptedData = await decryptMessage(data, senderId);
      message = JSON.parse(new TextDecoder().decode(decryptedData));
    }
    const discussion = getDiscussion(senderId);

    if (message.type === "typing") {
      connectionStatus.textContent = "Typing...";
    } else if (message.type === "stop-typing") {
      connectionStatus.textContent = isRelayActive
        ? "Connected (Relay)"
        : "Connected (WebRTC)";
    } else if (message.type === "file-start") {
      fileChunks.set(message.fileId, {
        chunks: [],
        meta: {
          name: message.fileName,
          type: message.fileType,
          timestamp: message.timestamp,
          messageId: message.messageId,
        },
      });
      if (senderId !== clientId) {
        socket.send(
          JSON.stringify({
            type: "message-status",
            status: "delivered",
            messageIds: [message.messageId],
            target: senderId,
          })
        );
      }
    } else if (message.type === "file-chunk") {
      const fileData = fileChunks.get(message.fileId);
      if (fileData) {
        const chunk = base64ToUint8Array(message.data);
        fileData.chunks.push(chunk);
      }
    } else if (message.type === "file-end") {
      const fileData = fileChunks.get(message.fileId);
      if (fileData) {
        const fileBlob = new Blob(fileData.chunks, {
          type: fileData.meta.type,
        });
        const fileUrl = URL.createObjectURL(fileBlob);
        discussion.messages.push({
          id: fileData.meta.messageId,
          sender: peers[senderId],
          file: { name: fileData.meta.name, url: fileUrl },
          timestamp: fileData.meta.timestamp,
        });
        saveDiscussion(senderId, discussion);
        renderMessages(senderId);
        fileChunks.delete(message.fileId);
      }
    } else if (message.type === "text") {
      discussion.messages.push({
        id: message.id,
        sender: peers[senderId],
        text: message.content,
        timestamp: message.timestamp,
      });
      saveDiscussion(senderId, discussion);
      renderMessages(senderId);
      if (senderId !== clientId) {
        socket.send(
          JSON.stringify({
            type: "message-status",
            status: "delivered",
            messageIds: [message.id],
            target: senderId,
          })
        );
      }
    } else if (message.type === "voice") {
      const audioBlob = new Blob([base64ToUint8Array(message.data)], {
        type: "audio/webm",
      });
      const audioUrl = URL.createObjectURL(audioBlob);
      discussion.messages.push({
        id: message.id,
        sender: peers[senderId],
        audioUrl: audioUrl,
        timestamp: message.timestamp,
      });
      saveDiscussion(senderId, discussion);
      renderMessages(senderId);
      if (senderId !== clientId) {
        socket.send(
          JSON.stringify({
            type: "message-status",
            status: "delivered",
            messageIds: [message.id],
            target: senderId,
          })
        );
      }
    } else if (message.type === "message-status") {
      const discussion = getDiscussion(currentTargetId);
      message.messageIds.forEach((messageId) => {
        const msg = discussion.messages.find((m) => m.id === messageId);
        if (msg) {
          msg.status = message.status;
        }
      });
      saveDiscussion(currentTargetId, discussion);
      renderMessages(currentTargetId);
    }
  } catch (error) {
    console.error("Error processing incoming message:", error);
  }
}

async function initiateCall(video) {
  if (!manualStatusOverride) {
    sendStatusUpdate("In call");
  }
  callStartTime = new Date();
  if (!currentTargetId) {
    showNotification("Please select a contact to call.", "warning");
    return;
  }
  if (
    !isRelayActive &&
    (!localConnection || localConnection.connectionState !== "connected")
  ) {
    showNotification(
      "You must be connected to a peer to start a call.",
      "error"
    );
    return;
  }

  isVideoCall = video;

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: isVideoCall,
      audio: true,
    });
    localVideo.srcObject = localStream;
    localStream
      .getTracks()
      .forEach((track) => localConnection.addTrack(track, localStream));

    if (isVideoCall) {
      videoCallDialog.style.display = "block";
    } else {
      voiceCallBtn.classList.add("hidden");
      videoCallBtn.classList.add("hidden");
      voiceMuteBtn.classList.remove("hidden");
      voiceHangUpBtn.classList.remove("hidden");
    }
    recordBtn.classList.add("hidden");
    playAudioWithLoop(dialingSound, 5);

    const offer = await localConnection.createOffer();
    await localConnection.setLocalDescription(offer);

    socket.send(
      JSON.stringify({
        type: isVideoCall ? "video-offer" : "voice-offer",
        data: offer,
        target: currentTargetId,
      })
    );

    showNotification(`Calling ${currentTargetName}...`, "info");
  } catch (err) {
    console.error(
      `Error starting ${isVideoCall ? "video" : "voice"} call:`,
      err
    );
    showNotification(
      `Could not start ${
        isVideoCall ? "video" : "voice"
      } call. Check camera/mic permissions.`,
      "error"
    );
  }
}

async function handleCallOffer(offer, fromId, isVideo) {
  if (
    localConnection &&
    localConnection.connectionState === "connected" &&
    localStream
  ) {
    console.log("Already in a call, rejecting new offer.");
    socket.send(JSON.stringify({ type: "decline-call", target: fromId }));
    return;
  }

  incomingOffer = offer;
  callInitiatorId = fromId;
  isVideoCall = isVideo;

  incomingCallText.textContent = isVideo
    ? "Incoming Video Call"
    : "Incoming Voice Call";
  callerName.textContent = peers[fromId] || "Unknown";
  incomingCallModal.classList.remove("hidden");
  playAudioWithLoop(ringingSound, 5);
}

async function answerCall() {
  incomingCallModal.classList.add("hidden");
  stopAudio(ringingSound);
  callStartTime = new Date();
  if (!manualStatusOverride) {
    sendStatusUpdate("In call");
  }

  if (!localConnection) {
    console.error("No local connection to answer call");
    return;
  }

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: isVideoCall,
      audio: true,
    });
    localVideo.srcObject = localStream;
    localStream
      .getTracks()
      .forEach((track) => localConnection.addTrack(track, localStream));

    if (isVideoCall) {
      videoCallDialog.style.display = "block";
    } else {
      voiceCallBtn.classList.add("hidden");
      videoCallBtn.classList.add("hidden");
      voiceMuteBtn.classList.remove("hidden");
      voiceHangUpBtn.classList.remove("hidden");
    }
    recordBtn.classList.add("hidden");

    await localConnection.setRemoteDescription(
      new RTCSessionDescription(incomingOffer)
    );
    const answer = await localConnection.createAnswer();
    await localConnection.setLocalDescription(answer);

    socket.send(
      JSON.stringify({
        type: isVideoCall ? "video-answer" : "voice-answer",
        data: answer,
        target: callInitiatorId,
      })
    );

    currentTargetId = callInitiatorId;
    currentTargetName = peers[callInitiatorId];
    chatWith.textContent = "Chatting with: " + currentTargetName;

    incomingOffer = null;
    callInitiatorId = null;
  } catch (err) {
    console.error("Error answering call:", err);
    showNotification(
      "Could not answer call. Check camera/mic permissions.",
      "error"
    );
  }
}

async function handleCallAnswer(answer) {
  await localConnection.setRemoteDescription(new RTCSessionDescription(answer));
  stopAudio(dialingSound);
  showNotification("Call connected!", "info");
}

function declineCall() {
  incomingCallModal.classList.add("hidden");
  stopAudio(ringingSound);
  socket.send(
    JSON.stringify({
      type: "decline-call",
      target: callInitiatorId,
    })
  );
  incomingOffer = null;
  callInitiatorId = null;
}

function hangUp() {
  socket.send(
    JSON.stringify({
      type: "hang-up",
      target: currentTargetId,
    })
  );
  handleHangUp(true);
}

function handleHangUp(shouldCreateNewConnection = true) {
  if (!manualStatusOverride) {
    sendStatusUpdate("Online");
  }
  stopAudio(dialingSound);
  stopAudio(ringingSound);
  voiceCallBtn.classList.remove("hidden");
  videoCallBtn.classList.remove("hidden");
  voiceMuteBtn.classList.add("hidden");
  voiceHangUpBtn.classList.add("hidden");
  if (incomingOffer && !localStream) {
    incomingCallModal.classList.add("hidden");
    const discussion = getDiscussion(callInitiatorId);
    discussion.calls.push({
      type: isVideoCall ? "video" : "voice",
      status: "missed",
      timestamp: new Date().toISOString(),
    });
    saveDiscussion(callInitiatorId, discussion);
    renderMessages(callInitiatorId);
  } else if (callStartTime) {
    const callEndTime = new Date();
    const duration = Math.round((callEndTime - callStartTime) / 1000);
    const discussion = getDiscussion(currentTargetId);
    discussion.calls.push({
      type: isVideoCall ? "video" : "voice",
      duration: duration,
      timestamp: callEndTime.toISOString(),
      status: "ended",
    });
    saveDiscussion(currentTargetId, discussion);
    renderMessages(currentTargetId);
    callStartTime = null;
  }
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
    localStream = null;
  }

  videoCallDialog.style.display = "none";
  resetVideoDialog();
  recordBtn.classList.remove("hidden");
  remoteVideo.srcObject = null;
  remoteAudio.srcObject = null;
  localVideo.srcObject = null;

  if (localConnection) {
    localConnection.close();
    localConnection = null;
  }

  if (shouldCreateNewConnection && currentTargetId) {
    createConnection();
  }
  showNotification("Call ended.", "info");
}

function toggleMute() {
  if (!localStream) return;
  localStream.getAudioTracks().forEach((track) => {
    track.enabled = !track.enabled;
    const icon = track.enabled
      ? '<i class="fas fa-microphone"></i>'
      : '<i class="fas fa-microphone-slash"></i>';
    muteBtn.innerHTML = icon;
    voiceMuteBtn.innerHTML = icon;
  });
}

function playAudioWithLoop(audioElement, loopCount) {
  let playedCount = 0;
  audioElement.currentTime = 0;
  const playPromise = audioElement.play();
  if (playPromise !== undefined) {
    playPromise
      .then((_) => {
        // Autoplay started!
      })
      .catch((error) => {
        // Autoplay was prevented.
        console.error("Autoplay prevented: ", error);
      });
  }
  playedCount++;

  audioElement.onended = () => {
    if (playedCount < loopCount) {
      audioElement.currentTime = 0;
      audioElement.play();
      playedCount++;
    }
  };
}

function stopAudio(audioElement) {
  audioElement.pause();
  audioElement.currentTime = 0;
  audioElement.onended = null;
}
