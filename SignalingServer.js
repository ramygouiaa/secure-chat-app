import { WebSocketServer } from "ws";
import { Peer } from "./Peer.js";
import { config } from "./config.js";

export class SignalingServer {
  constructor(server, messageHandler) {
    this.wss = new WebSocketServer({ server });
    this.peers = new Map();
    this.messageHandler = messageHandler;
  }

  start() {
    this.wss.on("connection", (ws, req) => {
      this.handleConnection(ws, req);
    });

    this.wss.on("error", (err) => {
      console.error("WebSocket server error:", err);
    });

    console.log("Signaling server started");
  }

  handleConnection(ws, req) {
    const peer = new Peer(ws);
    this.peers.set(peer.id, peer);

    console.log(
      `New peer connected: ${peer.id} from ${req.socket.remoteAddress}`
    );

    peer.send({
      type: "init",
      id: peer.id,
      timestamp: Date.now(),
    });

    const heartbeatInterval = setInterval(() => {
      if (ws.readyState === 1) {
        // WebSocket.OPEN
        ws.ping();
      }
    }, config.heartbeatInterval);

    ws.on("message", (message) => {
      this.messageHandler.handle(peer, message);
    });

    ws.on("close", () => {
      clearInterval(heartbeatInterval);
      console.log(`Peer disconnected: ${peer.name || "unknown"} (${peer.id})`);
      this.peers.delete(peer.id);
      this.broadcastPeerList();
    });

    ws.on("error", (err) => {
      console.error(`WebSocket error for ${peer.id}:`, err);
    });

    ws.on("pong", () => {
      console.log(`Received pong from ${peer.id}`);
    });
  }

  broadcastPeerList() {
    const list = [...this.peers.values()].map(({ id, name, status }) => ({
      id,
      name,
      status,
    }));
    const message = {
      type: "peer-list",
      peers: list,
      timestamp: Date.now(),
    };

    let sentCount = 0;
    this.peers.forEach((peer) => {
      peer.send(message);
      sentCount++;
    });
    console.log(`Broadcast peer list to ${sentCount} clients`);
  }

  shutdown() {
    console.log("Shutting down server...");
    this.wss.clients.forEach((client) => {
      if (client.readyState === 1) {
        // WebSocket.OPEN
        client.send(
          JSON.stringify({
            type: "server-shutdown",
            message: "Server is shutting down",
          })
        );
        client.close();
      }
    });

    this.wss.close(() => {
      console.log("Server closed");
      process.exit();
    });
  }
}
