// /js/signaling.js

import { EventEmitter } from './events.js';

export class SignalingClient extends EventEmitter {
    constructor(stateManager, eventEmitter) {
        super();
        this.stateManager = stateManager;
        this.socket = null;
        this.emitter = eventEmitter; // Use the shared event emitter
    }

    connect() {
        const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${wsProtocol}//${window.location.host}`;
        this.socket = new WebSocket(wsUrl);

        this.socket.onopen = this.onOpen.bind(this);
        this.socket.onclose = this.onClose.bind(this);
        this.socket.onerror = this.onError.bind(this);
        this.socket.onmessage = this.onMessage.bind(this);
    }

    onOpen() {
        this.emitter.emit('signaling:connected');
    }

    onClose() {
        this.emitter.emit('signaling:disconnected',
            "Disconnected from signaling server. Reconnecting...",
            "warning"
        );
        // Attempt to reconnect
        setTimeout(() => this.connect(), 3000);
    }

    onError(err) {
        this.emitter.emit('signaling:error', err);
        // The 'onclose' event will likely follow an error, triggering reconnect
    }

    async onMessage(event) {
        try {
            const message = JSON.parse(event.data);
            console.log("Signaling message received:", message.type, message);
            switch (message.type) {
                case "init":
                    this._handleInitMessage(message);
                    break;
                case "peer-list":
                    this._handlePeerListMessage(message);
                    break;
                case "offer":
                case "answer":
                    this._handleSdpMessage(message);
                    break;
                case "relay-key-exchange":
                    this._handleRelayKeyExchange(message);
                    break;
                case "relay-key-exchange-ack":
                    this._handleRelayKeyExchangeAck(message);
                    break;
                case "ice-candidate":
                    this._handleIceCandidate(message);
                    break;
                case "relay":
                    this._handleRelayData(message);
                    break;
                case "server-shutdown":
                    this._handleServerShutdown(message);
                    break;
                case "video-offer":
                case "voice-offer":
                    this._handleIncomingCallOffer(message);
                    break;
                case "message-status":
                    this._handleMessageStatus(message);
                    break;
                case "video-answer":
                case "voice-answer":
                    this._handleIncomingCallAnswer(message);
                    break;
                case "call-ended":
                    this._handleCallEnded(message);
                    break;
                case "peer-typing":
                    this._handlePeerTyping(message);
                    break;
                case "peer-status-update":
                    this._handlePeerStatusUpdate(message);
                    break;
                case "hang-up":
                    this._handleHangUp(message);
                    break;
                case "decline-call":
                    this._handleDeclineCall(message);
                    break;
                case "call-busy":
                    this._handleCallBusy(message);
                    break;
                default:
                    console.warn("Unknown signaling message type:", message.type);
            }
        } catch (error) {
            console.error("Error processing signaling message:", error);
        }
    }

    _handleInitMessage(message) {
        this.stateManager.setClientId(message.id);
        this.emitter.emit('signaling:initialized', message.id);
        const userName = this.stateManager.getUserName();
        if (userName) {
             this.send({ type: "register", name: userName });
        }
    }

    _handlePeerListMessage(message) {
        this.stateManager.updatePeerList(message.peers);
        this.emitter.emit('signaling:peer-list', message.peers);
    }

    _handleSdpMessage(message) {
         // This might need further refinement based on how offer/answer handling
         // is truly separated between Signaling and WebRTC modules.
         // For now, just emitting based on type.
         this.emit(`signaling:${message.type}`, message);
    }

    _handleRelayKeyExchange(message) {
        this.emit('signaling:relay-key-exchange', message);
    }

    _handleRelayKeyExchangeAck(message) {
        this.emit('signaling:relay-key-exchange-ack', message);
    }

    _handleIceCandidate(message) {
        this.emit('signaling:ice-candidate', message);
    }

    _handleRelayData(message) {
         this.emit('signaling:relay-data', message);
    }

    _handleServerShutdown(message) {
        this.emitter.emit('signaling:server-shutdown', message.message);
        this.socket.close();
    }

    _handleIncomingCallOffer(message) {
        this.emit('call:incoming-offer', message);
    }

    _handleMessageStatus(message) {
        this.emit('signaling:message-status', message);
    }

    _handleIncomingCallAnswer(message) {
        this.emit('call:incoming-answer', message);
    }

    _handleCallEnded(message) {
        this.emit('call:ended', message);
    }

    _handlePeerTyping(message) {
        this.emit('signaling:peer-typing', message);
    }

    _handlePeerStatusUpdate(message) {
         this.emit('signaling:peer-status-update', message);
    }



    send(message) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(message));
        } else {
            console.warn("WebSocket not open. Cannot send message:", message);
        }
    }

    // Methods for sending specific signaling messages (will be called by other modules)
    sendRegister(name) { this.send({ type: 'register', name });}
    sendOffer(offer, to, publicKey, isVideo) { this.send({ type: isVideo ? 'video-offer' : 'voice-offer', data: offer, to, publicKey }); }
    sendAnswer(answer, to, publicKey, isVideo) { this.send({ type: isVideo ? 'video-answer' : 'voice-answer', data: answer, to, publicKey }); }
    sendIceCandidate(candidate, to) { this.send({ type: 'ice-candidate', data: candidate, to }); }
    sendRelayKeyExchange(to, publicKey) { this.send({ type: 'relay-key-exchange', to, publicKey }); }
    sendRelayKeyExchangeAck(to, publicKey) { this.send({ type: 'relay-key-exchange-ack', to, publicKey }); }
    sendRelayData(payload, to) { this.send({ type: 'relay', payload, to }); } // Payload is base64
    sendCallEnded(to, reason) { this.send({ type: 'call-ended', to, reason }); }
    sendHangUp(to) { this.send({ type: 'hang-up', to }); }
    sendDeclineCall(to) { this.send({ type: 'decline-call', to }); }
    sendMessageStatus(to, messageId, status) { this.send({ type: 'message-status', to, messageId, status }); }
    sendStatusUpdate(status) { this.send({ type: 'status-update', status }); }
}
