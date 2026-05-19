export class MessageHandler {
  constructor(signalingServer) {
    this.signalingServer = signalingServer;
  }

  handle(peer, message) {
    try {
      const data = JSON.parse(message);
      console.log(`Message from ${peer.id}:`, data.type);

      switch (data.type) {
        case "register":
          this.handleRegister(peer, data);
          break;
        case "status-update":
          this.handleStatusUpdate(peer, data);
          break;
        case "chat-message":
          this.handleChatMessage(peer, data);
          break;
        case "typing":
          this.handleTyping(peer, data);
          break;
        case "relay":
        case "relay-key-exchange":
        case "relay-key-exchange-ack":
        case "message-status":
        case "offer":
        case "answer":
        case "ice-candidate":
        case "video-offer":
        case "voice-offer":
        case "video-answer":
        case "voice-answer":
        case "hang-up":
        case "decline-call":
          this.handleRelay(peer, data);
          break;
        case "ping":
          console.log(`Received ping from ${peer.id}`);
          break;
        default:
          console.log(`Unknown message type: ${data.type}`);
      }
    } catch (err) {
      console.error("Message parsing error:", err);
    }
  }

  handleRegister(peer, data) {
    peer.name = data.name;
    console.log(`Client registered: ${data.name} (${peer.id})`);
    this.signalingServer.broadcastPeerList();
  }

  handleStatusUpdate(peer, data) {
    peer.status = data.status;
    console.log(`Status update for ${peer.name || peer.id}: ${data.status}`);
    this.signalingServer.broadcastPeerList();
  }

  handleChatMessage(peer, data) {
    const targetPeer = this.signalingServer.peers.get(data.targetId);
    if (targetPeer) {
      const chatMessage = {
        type: "chat-message",
        from: peer.id,
        fromName: peer.name || "Unknown",
        message: data.message,
        timestamp: Date.now(),
      };
      targetPeer.send(JSON.stringify(chatMessage));
      console.log(
        `Chat message relayed from ${peer.name || peer.id} to ${data.targetId}`
      );
    } else {
      console.log(
        `Cannot relay chat message. Target peer ${data.targetId} is not connected.`
      );
    }
  }

  handleTyping(peer, data) {
    const targetPeer = this.signalingServer.peers.get(data.targetId);
    if (targetPeer) {
      const typingMessage = {
        type: "typing",
        from: peer.id,
        fromName: peer.name || "Unknown",
        timestamp: Date.now(),
      };
      targetPeer.send(JSON.stringify(typingMessage));
      console.log(
        `Typing indicator relayed from ${peer.name || peer.id} to ${
          data.targetId
        }`
      );
    } else {
      console.log(
        `Cannot relay typing indicator. Target peer ${data.targetId} is not connected.`
      );
    }
  }

  handleRelay(peer, data) {
    const targetPeer = this.signalingServer.peers.get(data.target);
    if (targetPeer) {
      const relayMessage = {
        type: data.type,
        from: peer.id,
        data: data.data,
        publicKey: data.publicKey,
        payload: data.payload,
        status: data.status,
        messageIds: data.messageIds,
        relayTimestamp: Date.now(),
      };
      targetPeer.send(JSON.stringify(relayMessage));
      console.log(`Relayed ${data.type} from ${peer.id} to ${data.target}`);
    } else {
      console.log(`Cannot relay. Target peer ${data.target} is not connected.`);
    }
  }
}
