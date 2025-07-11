// js/webrtc.js

import { exportPublicKey, importPublicKey, deriveSharedSecret } from "./e2ee.js";

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
        // Call related signaling events are now handled by the App class and delegated to MediaManager
        // this.signalingClient.on("video-offer", (data, fromId) => this.handleCallOffer(data, fromId, true));
        // this.signalingClient.on("voice-offer", (data, fromId) => this.handleCallOffer(data, fromId, false));
        // this.signalingClient.on("video-answer", this.handleCallAnswer.bind(this));
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

        // Data channel received from remote peer
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

        // Media tracks received from remote peer
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
     
         // If we already have a connection with this peer, close it before creating a new one
         if (this.localConnection) {
             this.localConnection.close();
         }

         this.localConnection = new RTCPeerConnection(ICE_SERVERS);
         this.stateManager.setState({ isRelayActive: false }); // Reset relay state

         // Data channel received from remote peer
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
    
    // Need methods for adding and removing tracks when media stream changes (e.g., starting/stopping video)
    addStream(stream) { /* ... */ }
    removeStream(stream) { /* ... */ }
}
