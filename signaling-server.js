const WebSocket = require("ws");
const crypto = require("crypto");
const http = require("http");
const fs = require("fs");
const path = require("path");

const server = http.createServer((req, res) => {
  let filePath = "." + req.url;
  if (filePath === "./") {
    filePath = "./secure-chat.html";
  }

  const extname = String(path.extname(filePath)).toLowerCase();
  const mimeTypes = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".mp3": "audio/mpeg",
  };

  const contentType = mimeTypes[extname] || "application/octet-stream";

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code == "ENOENT") {
        res.writeHead(404, { "Content-Type": "text/html" });
        res.end("<h1>404 Not Found</h1>", "utf-8");
      } else {
        res.writeHead(500);
        res.end(
          "Sorry, check with the site admin for error: " + error.code + " ..\n"
        );
      }
    } else {
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content, "utf-8");
    }
  });
});

const wss = new WebSocket.Server({ server });
const peers = new Map(); // clientId -> { ws, name }

// Enhanced logging
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(
    `Server running on http://localhost:${PORT} at ${new Date().toISOString()}`
  );
});

wss.on("connection", (ws, req) => {
  const clientId = crypto.randomUUID();
  const clientIp = req.socket.remoteAddress;
  peers.set(clientId, { ws, name: null });

  console.log(`New peer connected: ${clientId} from ${clientIp}`);

  // Send initialization message with server timestamp
  ws.send(
    JSON.stringify({
      type: "init",
      id: clientId,
      timestamp: Date.now(),
    })
  );

  // Heartbeat to keep connection alive
  const heartbeatInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  }, 30000);

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      console.log(`Message from ${clientId}:`, data.type);

      if (data.type === "register") {
        // Register new client
        peers.get(clientId).name = data.name;
        console.log(`Client registered: ${data.name} (${clientId})`);
        broadcastPeerList();
      } else if (data.target && peers.has(data.target)) {
        // Relay message to target peer with additional metadata
        const targetPeer = peers.get(data.target);
        if (targetPeer.ws.readyState === WebSocket.OPEN) {
          const relayMessage = JSON.stringify({
            ...data,
            from: clientId,
            relayTimestamp: Date.now(),
          });
          targetPeer.ws.send(relayMessage);
          console.log(`Relayed message from ${clientId} to ${data.target}`);
        } else {
          console.log(`Target peer ${data.target} not connected`);
        }
      }
    } catch (err) {
      console.error("Message parsing error:", err);
    }
  });

  ws.on("close", () => {
    clearInterval(heartbeatInterval);
    const peerInfo = peers.get(clientId);
    console.log(
      `Peer disconnected: ${peerInfo?.name || "unknown"} (${clientId})`
    );
    peers.delete(clientId);
    broadcastPeerList();
  });

  ws.on("error", (err) => {
    console.error(`WebSocket error for ${clientId}:`, err);
  });

  ws.on("pong", () => {
    // Client responded to heartbeat
    console.log(`Received pong from ${clientId}`);
  });
});

function broadcastPeerList() {
  const list = [...peers.entries()].map(([id, { name }]) => ({ id, name }));
  const message = JSON.stringify({
    type: "peer-list",
    peers: list,
    timestamp: Date.now(),
  });

  let sentCount = 0;
  peers.forEach(({ ws }, clientId) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
      sentCount++;
    }
  });
  console.log(`Broadcast peer list to ${sentCount} clients`);
}

// Handle server shutdown gracefully
process.on("SIGINT", () => {
  console.log("Shutting down server...");
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          type: "server-shutdown",
          message: "Server is shutting down",
        })
      );
      client.close();
    }
  });

  wss.close(() => {
    console.log("Server closed");
    process.exit();
  });
});

// Error handling for the WebSocket server
wss.on("error", (err) => {
  console.error("WebSocket server error:", err);
});
