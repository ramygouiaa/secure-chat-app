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

  handleRelay(peer, data) {
    const targetPeer = this.signalingServer.peers.get(data.target);
    if (targetPeer) {
      const relayMessage = {
        ...data,
        from: peer.id,
        relayTimestamp: Date.now(),
      };
      targetPeer.send(relayMessage);
      console.log(`Relayed ${data.type} from ${peer.id} to ${data.target}`);
    } else {
      console.log(`Cannot relay. Target peer ${data.target} is not connected.`);
    }
  }
}
