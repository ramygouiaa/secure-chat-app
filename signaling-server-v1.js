// signaling-server.js
const WebSocket = require("ws");

const wss = new WebSocket.Server({ port: 3000 });

const peers = new Map();
console.log("Signaling server started on ws://localhost:3000");

wss.on("connection", (ws) => {
  const id = crypto.randomUUID();
  peers.set(id, ws);
  console.log(`New peer connected: ${id}`);

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      const target = peers.get(data.target);
      if (target && target.readyState === WebSocket.OPEN) {
        target.send(JSON.stringify({ from: id, ...data }));
      }
    } catch (e) {
      console.error("Message error:", e);
    }
  });

  ws.on("close", () => {
    peers.delete(id);
    console.log(`Peer disconnected: ${id}`);
  });

  // Let peer know their ID
  ws.send(JSON.stringify({ type: "init", id }));
});
