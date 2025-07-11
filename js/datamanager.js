// js/datamanager.js

import { encryptMessage, decryptMessage } from '/js/e2ee.js'; // Assuming e2ee functions are exported
import { arrayBufferToBase64, base64ToUint8Array } from '/js/utils.js';
import { EventEmitter } from '/js/events.js';

export class DataManager {
    constructor(stateManager, webrtcConnection, signalingClient, uiController, eventEmitter) { // Accept eventEmitter
        this.state = stateManager;
        this.webrtc = webrtcConnection;
        this.signaling = signalingClient;
        this.ui = uiController;
        this.emitter = eventEmitter; // Store eventEmitter

        this.fileChunks = new Map(); // To manage incoming file chunks
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.typingTimeout = null;
    }

    init() {
        // Listen for data messages from WebRTC and relay messages from Signaling
        this.emitter.on('webrtc:dataMessage', ({ data, senderId }) => {
            this.handleIncomingMessage(data, senderId);
        });
        this.emitter.on('signaling:relayMessage', ({ payload, fromId }) => {
            this.handleIncomingRelayMessage(payload, fromId);
        });
    }


    // Sends data, prioritizing WebRTC DataChannel, falling back to relay
    async sendData(data) {
        const targetId = this.state.getCurrentTargetId();
        if (!targetId) {
             console.error("Cannot send data: No target selected.");
             this.ui.showNotification("Cannot send data: No target selected.", "error");
             return;
        }

        try {
            // Ensure shared secret exists before encrypting
            if (!this.state.getSharedSecret(targetId)) {
                 console.warn(`No shared secret for ${targetId}. Attempting key exchange.`);
                 await this.webrtc.initiateRelayKeyExchange(); // Attempt to establish key if missing
                 // Wait a moment for key exchange to complete, or handle retry logic
                 // For now, we might need to queue the message or rely on re-sending
                 // This simple implementation will just fail if key isn't immediately available
                 if (!this.state.getSharedSecret(targetId)) {
                      console.error("Failed to send data: Shared secret not established.");
                      this.ui.showNotification("Failed to send message: Security key missing.", "error");
                     return;
                 }
            }

             const encryptedData = await encryptMessage(
                JSON.stringify(data),
                targetId,
                this.state.getSharedSecret(targetId) // Pass shared secret
            );

            const forceRelay = this.state.getForceRelay();
            const isRelayActive = this.state.getIsRelayActive();
            const dataChannel = this.webrtc.getDataChannel();

            if (
                forceRelay ||
                isRelayActive ||
                !dataChannel ||
                dataChannel.readyState !== "open"
            ) {
                 // Fallback to WebSocket relay
                 // SignalingClient will handle encryption for relay messages if needed on server
                 // For now, we send the already encrypted data as payload
                if (this.signaling.isConnected()) {
                    this.signaling.send({
                        type: "relay",
                         target: targetId, // Assuming target is needed on server for relay
                        payload: arrayBufferToBase64(encryptedData),
                    });
                    console.log("Sent message via relay");
                } else {
                    this.ui.showNotification("Cannot send message. No connection.", "error");
                    console.error("Cannot send message. WebSocket is not open.");
                }
            } else {
                // Send via WebRTC
                dataChannel.send(encryptedData);
                console.log("Sent message via WebRTC");
            }
        } catch (error) {
            console.error("Error sending data:", error);
            this.ui.showNotification("Failed to send message.", "error");
        }
    }

    // Handles sending a text message
    async sendMessage() {
        const messageInput = this.ui.elements.messageInput; // Access UI element via uiController
        const text = messageInput.value.trim();
        const targetId = this.state.getCurrentTargetId();

        if (!text || !targetId) return;

        const message = {
            id: crypto.randomUUID(),
            type: "text",
            content: text,
            timestamp: new Date().toISOString(),
            status: "sent",
        };

        // Update UI immediately
        const discussion = this.state.getDiscussion(targetId);
        discussion.messages.push({
            id: message.id,
            sender: "You", // Or use userName from state
            senderId: this.state.getClientId(),
            text: text,
            timestamp: message.timestamp,
            status: "sent",
            itemType: 'message', // Add itemType for rendering
        });
        this.state.saveDiscussion(targetId, discussion);
         this.ui.renderMessages(discussion.messages, this.state.getClientId()); // Pass client ID for status icons
        this.ui.clearMessageInput();

        await this.sendData(message);
    }

    // Handles sending typing indicators
    handleTyping() {
        const targetId = this.state.getCurrentTargetId();
        if (!targetId) return;

        const typingMessage = { type: "typing" };
        this.sendData(typingMessage);

        clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => {
            const stopTypingMessage = { type: "stop-typing" };
            this.sendData(stopTypingMessage);
        }, 1000);
    }

    // Handles selecting and sending a file
    async handleFileSelect(event) {
        const file = event.target.files[0];
        const targetId = this.state.getCurrentTargetId();
        if (!file || !targetId) return;

        const CHUNK_SIZE = 16384; // 16KB
        const fileId = crypto.randomUUID();
        const timestamp = new Date().toISOString();
        const messageId = crypto.randomUUID();

        // Update UI immediately
        const fileUrl = URL.createObjectURL(file);
        const discussion = this.state.getDiscussion(targetId);
        discussion.messages.push({
            id: messageId,
            sender: "You", // Or use userName from state
            senderId: this.state.getClientId(),
            file: { name: file.name, url: fileUrl },
            timestamp: timestamp,
            status: "sent",
            itemType: 'message', // Add itemType for rendering
        });
        this.state.saveDiscussion(targetId, discussion);
         this.ui.renderMessages(discussion.messages, this.state.getClientId());

        // Send file in chunks
        const startMessage = {
            type: "file-start",
            messageId: messageId,
            fileId: fileId,
            fileName: file.name,
            fileType: file.type,
            timestamp: timestamp,
        };
        await this.sendData(startMessage);

        const arrayBuffer = await file.arrayBuffer();
        for (let i = 0; i < arrayBuffer.byteLength; i += CHUNK_SIZE) {
            const chunk = arrayBuffer.slice(i, i + CHUNK_SIZE);
            const chunkMessage = {
                type: "file-chunk",
                fileId: fileId,
                data: arrayBufferToBase64(chunk),
            };
            await this.sendData(chunkMessage);
        }

        const endMessage = { type: "file-end", fileId: fileId };
        await this.sendData(endMessage);
    }

    // Toggles voice recording
    async toggleRecording() {
        const recordBtn = this.ui.elements.recordBtn; // Access UI element via uiController
    
        if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
            this.mediaRecorder.stop();
            recordBtn.innerHTML = '<i class="fas fa-microphone"></i>';
        } else {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                this.state.setLocalStream(stream); // Store local stream
                this.mediaRecorder = new MediaRecorder(stream); // Create MediaRecorder
                this.mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) {
                        this.recordedChunks.push(event.data);
                    }
                };
                this.mediaRecorder.onstop = async () => {
                    this.state.getLocalStream().getTracks().forEach((track) => track.stop()); // Stop stream tracks
                    this.state.setLocalStream(null); // Clear local stream

                    const blob = new Blob(this.recordedChunks, { type: "audio/webm" });
                    this.recordedChunks = [];
                    const timestamp = new Date().toISOString();
                    const messageId = crypto.randomUUID();
                    const targetId = this.state.getCurrentTargetId();

                    // Update UI immediately
                    const audioUrl = URL.createObjectURL(blob);
                    const discussion = this.state.getDiscussion(targetId);
                    discussion.messages.push({
                        id: messageId,
                        sender: "You", // Or use userName from state
                        senderId: this.state.getClientId(),
                        audioUrl: audioUrl,
                        timestamp: timestamp,
                        status: "sent",
                        itemType: 'message', // Add itemType for rendering
                    });
                    this.state.saveDiscussion(targetId, discussion);
         this.ui.renderMessages(discussion.messages, this.state.getClientId());

                    // Send the voice message
                    const arrayBuffer = await blob.arrayBuffer();
                    const message = {
                        id: messageId,
                        type: "voice",
                        data: arrayBufferToBase64(arrayBuffer),
                        timestamp: timestamp,
                    };
                    await this.sendData(message);
                };
                this.mediaRecorder.start();
                recordBtn.innerHTML = '<i class="fas fa-stop"></i>';
            } catch (err) {
                console.error("Error accessing microphone:", err);
                this.ui.showNotification("Could not access microphone.", "error");
            }
        }
    }

    // Processes incoming messages from WebRTC DataChannel or relay
    async handleIncomingMessage(data, senderId) {
        try {
            let message;
             let decrypted = false;
            try {
                 // First attempt to parse assuming it's NOT encrypted (e.g., signaling status messages)
                message = JSON.parse(new TextDecoder().decode(data));
            } catch (error) {
                // If parsing fails, assume it's encrypted data
                const decryptedData = await decryptMessage(
                    data,
                    senderId,
                    this.state.getSharedSecret(senderId) // Pass shared secret
                );
                message = JSON.parse(new TextDecoder().decode(decryptedData));
                 decrypted = true;
            }

            const discussion = this.state.getDiscussion(senderId);

            if (message.type === "typing") {
                 // Only show typing indicator if currently chatting with this sender and it's from WebRTC
                if (this.state.getCurrentTargetId() === senderId) {
                    this.ui.updateConnectionStatus("Typing...");
                }
            } else if (message.type === "stop-typing") {
                // Only hide typing indicator if currently chatting with this sender
                 if (this.state.getCurrentTargetId() === senderId) {
                    this.ui.updateConnectionStatus(this.state.getIsRelayActive() ? "Connected (Relay)" : "Connected (WebRTC)");
                }
            } else if (message.type === "file-start") {
                this.fileChunks.set(message.fileId, {
                    chunks: [],
                    meta: {
                        name: message.fileName,
                        type: message.fileType,
                        timestamp: message.timestamp,
                        messageId: message.messageId,
                    },
                });
                 // Send delivered status only if it was received via WebRTC (or confirm relay sends status)
                 if (senderId !== this.state.getClientId()) {
                    this.signaling.send({
                        type: "message-status",
                        status: "delivered",
                        messageIds: [message.messageId],
                        target: senderId,
                    });
                 }
            } else if (message.type === "file-chunk") {
                const fileData = this.fileChunks.get(message.fileId);
                if (fileData) {
                    const chunk = base64ToUint8Array(message.data);
                    fileData.chunks.push(chunk);
                }
            } else if (message.type === "file-end") {
                const fileData = this.fileChunks.get(message.fileId);
                if (fileData) {
                    const fileBlob = new Blob(fileData.chunks, {
                        type: fileData.meta.type,
                    });
                    const fileUrl = URL.createObjectURL(fileBlob);
                    discussion.messages.push({
                        id: fileData.meta.messageId,
                        sender: this.state.getPeerName(senderId) || senderId, // Use peer name
                        senderId: senderId,
                        file: { name: fileData.meta.name, url: fileUrl },
                        timestamp: fileData.meta.timestamp,
                        itemType: 'message',
                    });
                    this.state.saveDiscussion(senderId, discussion);
                    // Only render if currently chatting with this sender
                     if (this.state.getCurrentTargetId() === senderId) {
                        this.ui.renderMessages(this.state.getDiscussion(senderId).messages, this.state.getClientId());
                    }
                     this.fileChunks.delete(message.fileId); // Clean up file chunks
                }
            } else if (message.type === "text") {
                discussion.messages.push({
                    id: message.id,
                    sender: this.state.getPeerName(senderId) || senderId, // Use peer name
                     senderId: senderId,
                    text: message.content,
                    timestamp: message.timestamp,
                    itemType: 'message',
                });
                this.state.saveDiscussion(senderId, discussion);
                 // Only render if currently chatting with this sender
                 if (this.state.getCurrentTargetId() === senderId) {
                    this.ui.renderMessages(this.state.getDiscussion(senderId).messages, this.state.getClientId());
                }
                 // Send delivered status only if it was received via WebRTC (or confirm relay sends status)
                 if (senderId !== this.state.getClientId()) {
                    this.signaling.send({
                        type: "message-status",
                        status: "delivered",
                        messageIds: [message.id],
                        target: senderId,
                    });
                 }
            } else if (message.type === "voice") {
                const audioBlob = new Blob([base64ToUint8Array(message.data)], {
                    type: "audio/webm",
                });
                const audioUrl = URL.createObjectURL(audioBlob);
                discussion.messages.push({
                    id: message.id,
                    sender: this.state.getPeerName(senderId) || senderId, // Use peer name
                     senderId: senderId,
                    audioUrl: audioUrl,
                    timestamp: message.timestamp,
                    itemType: 'message',
                });
                this.state.saveDiscussion(senderId, discussion);
                 // Only render if currently chatting with this sender
                 if (this.state.getCurrentTargetId() === senderId) {
                    this.ui.renderMessages(this.state.getDiscussion(senderId).messages, this.state.getClientId());
                }
                 // Send delivered status only if it was received via WebRTC (or confirm relay sends status)
                 if (senderId !== this.state.getClientId()) {
                    this.signaling.send({
                        type: "message-status",
                        status: "delivered",
                        messageIds: [message.id],
                        target: senderId,
                    });
                 }
            } else if (message.type === "message-status" && !decrypted) { // Assuming status messages are not encrypted over signaling
                 // Handle message status updates (delivered, read)
                const discussion = this.state.getDiscussion(message.from); // Status is for messages from this user, check message structure
                if (discussion) {
                     message.messageIds.forEach((messageId) => {
                        const msg = discussion.messages.find((m) => m.id === messageId);
                        if (msg) {
                             // Ensure status update is higher priority (e.g., read > delivered > sent). Assuming 'message.status' is the new status
                             if (msg.status !== 'read' || message.status === 'read') {
                                msg.status = message.status;
                             }
                        }
                    });
                    this.state.saveDiscussion(message.from, discussion);
                    // Only re-render if currently viewing this discussion
                     if (this.state.getCurrentTargetId() === message.from) {
                         this.ui.renderMessages(this.state.getDiscussion(message.from).messages, this.state.getClientId());
                     }
                }
            }
            // Call signaling messages are handled by SignalingClient and WebRTCConnection
            // This `DataManager` handles data channel/relay messages. Signaling messages
            // might be handled directly by the `SignalingClient` and then routed.

        } catch (error) {
            console.error("Error processing incoming message:", error);
             // Attempt to decrypt if it failed initially (could be signaling message encrypted by mistake)
             try {
                 const decryptedData = await decryptMessage(
                    data,
                    senderId,
                    this.state.getSharedSecret(senderId) // Pass shared secret
                );
                const message = JSON.parse(new TextDecoder().decode(decryptedData));
                console.warn("Message was encrypted but should not have been:", message);
                // Handle it as appropriate, or log a warning
             } catch (decryptionError) {
                 console.error("Failed to process message: Neither unencrypted nor encrypted with known key.", decryptionError);
             }
            this.ui.showNotification("Received unreadable message.", "warning");
        }
    }

     // Called by SignalingClient when a relay message is received
     handleIncomingRelayMessage(payload, fromId) {
         const decryptedPayload = base64ToUint8Array(payload);
         this.handleIncomingMessage(decryptedPayload, fromId);
     }
}