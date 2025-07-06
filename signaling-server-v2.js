const WebSocket = require("ws");

const wss = new WebSocket.Server({ port: 3000 });
const peers = new Map(); // clientId -> { ws, name }

console.log("Signaling server started on ws://localhost:3000");

wss.on("connection", (ws) => {
  const clientId = crypto.randomUUID();
  peers.set(clientId, { ws, name: null });
  console.log(`New peer connected: ${clientId}`);

  ws.send(JSON.stringify({ type: "init", id: clientId }));

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === "register") {
        peers.get(clientId).name = data.name;
        broadcastPeerList();
      } else if (data.target && peers.has(data.target)) {
        peers
          .get(data.target)
          .ws.send(JSON.stringify({ from: clientId, ...data }));
      }
    } catch (err) {
      console.error("Message error:", err);
    }
  });

  ws.on("close", () => {
    peers.delete(clientId);
    broadcastPeerList();
  });

  function broadcastPeerList() {
    const list = [...peers.entries()].map(([id, { name }]) => ({ id, name }));
    const message = JSON.stringify({ type: "peer-list", peers: list });

    for (const { ws } of peers.values()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }
});
