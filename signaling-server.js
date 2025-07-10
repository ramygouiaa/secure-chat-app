const express = require("express");
const http = require("http");
const { v4: uuidv4 } = require("uuid");
const WebSocket = require("ws");
const mediasoup = require("mediasoup");
const config = require("./config");

const app = express();
app.use(express.static(__dirname));
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/secure-chat.html");
});
const server = http.createServer(app);

const wss = new WebSocket.Server({ server });

let worker;
let router;
let peers = {}; // id -> { name, ws, transports, producers, consumers }
let rooms = {}; // roomId -> { router, peers }

async function startMediasoup() {
  worker = await mediasoup.createWorker({
    logLevel: config.mediasoup.worker.logLevel,
    logTags: config.mediasoup.worker.logTags,
    rtcMinPort: config.mediasoup.worker.rtcMinPort,
    rtcMaxPort: config.mediasoup.worker.rtcMaxPort,
  });

  worker.on("died", () => {
    console.error("mediasoup worker has died");
    setTimeout(() => process.exit(1), 2000); // exit in 2 seconds
  });

  const mediaCodecs = config.mediasoup.router.mediaCodecs;
  router = await worker.createRouter({ mediaCodecs });
}

wss.on("connection", (ws) => {
  const clientId = uuidv4();
  peers[clientId] = {
    ws,
    name: null,
    transports: new Map(),
    producers: new Map(),
    consumers: new Map(),
  };

  console.log(`New peer connected: ${clientId}`);
  ws.send(JSON.stringify({ type: "init", id: clientId }));

  ws.on("message", (message) => {
    console.log(`Message from ${clientId}: ${message.slice(0, 100)}`);
    try {
      const data = JSON.parse(message);
      handleMessage(clientId, data);
    } catch (e) {
      console.error(`Failed to parse message from ${clientId}:`, e);
    }
  });

  ws.on("close", () => {
    console.log(`Peer disconnected: ${clientId}`);
    // Here we should also clean up mediasoup resources associated with this peer
    delete peers[clientId];
    broadcastPeerList();
  });

  ws.on("error", (err) => {
    console.error(`Error with peer ${clientId}:`, err);
  });
});

async function handleMessage(clientId, data) {
  const peer = peers[clientId];
  switch (data.type) {
    case "register":
      peer.name = data.name;
      console.log(`Client registered: ${data.name} (${clientId})`);
      broadcastPeerList();
      break;

    case "getRouterRtpCapabilities":
      send(clientId, {
        type: "routerRtpCapabilities",
        data: router.rtpCapabilities,
      });
      break;

    case "createWebRtcTransport":
      try {
        const transport = await createWebRtcTransport(clientId);
        peer.transports.set(transport.id, transport);
        send(clientId, {
          type: "webRtcTransportCreated",
          data: {
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
          },
        });
      } catch (error) {
        console.error("Error creating WebRTC transport:", error);
      }
      break;

    case "connectTransport":
      {
        const { transportId, dtlsParameters } = data;
        const transport = peer.transports.get(transportId);
        if (!transport) {
          console.error(`Transport with id ${transportId} not found`);
          return;
        }
        await transport.connect({ dtlsParameters });
        send(clientId, {
          type: "transport-connected",
          transportId: transportId,
        });
      }
      break;

    case "produce":
      {
        const { transportId, kind, rtpParameters } = data;
        const transport = peer.transports.get(transportId);
        if (!transport) {
          console.error(`Transport with id ${transportId} not found`);
          return;
        }
        const producer = await transport.produce({ kind, rtpParameters });
        peer.producers.set(producer.id, producer);

        send(clientId, { type: "producer-created", producerId: producer.id });

        // Forward the new producer to all other peers in the room
        // (For now, we'll just broadcast to everyone for simplicity)
        for (const otherPeerId in peers) {
          if (otherPeerId !== clientId) {
            send(otherPeerId, {
              type: "newProducer",
              data: {
                producerId: producer.id,
                producerClientId: clientId,
              },
            });
          }
        }
      }
      break;

    case "consume":
      {
        const { rtpCapabilities, producerId, transportId } = data.payload;
        const transport = peer.transports.get(transportId);
        if (!transport) {
          console.error(
            `Transport with id ${transportId} not found for consuming`
          );
          return;
        }
        const consumer = await createConsumer(
          transport,
          producerId,
          rtpCapabilities
        );
        if (!consumer) {
          return;
        }
        peer.consumers.set(consumer.id, consumer);
        send(clientId, {
          type: "consumed",
          data: {
            id: consumer.id,
            producerId: producerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
          },
        });
      }
      break;

    case "resume":
      {
        const { consumerId } = data.payload;
        const consumer = peer.consumers.get(consumerId);
        if (!consumer) {
          console.error(
            `Consumer with id ${consumerId} not found for resuming`
          );
          return;
        }
        await consumer.resume();
      }
      break;

    // --- E2EE and Data Channel ---
    case "key-exchange":
      // Relay key exchange messages directly to the target
      if (peers[data.target]) {
        send(data.target, {
          type: "key-exchange",
          from: clientId,
          publicKey: data.publicKey,
        });
      }
      break;

    case "relay":
      // Relay generic data messages (text, files, etc.)
      if (peers[data.target]) {
        send(data.target, {
          type: "relay",
          from: clientId,
          payload: data.payload, // The encrypted payload
        });
      }
      break;

    // --- Call Signaling ---
    case "initiate-call":
      if (peers[data.target]) {
        console.log(
          `Relaying 'initiate-call' from ${clientId} to ${data.target}`
        );
        send(data.target, {
          type: "incoming-call",
          from: clientId,
          name: peer.name,
          video: data.video,
        });
      }
      break;

    case "decline-call":
      if (peers[data.target]) {
        console.log(
          `Relaying 'decline-call' from ${clientId} to ${data.target}`
        );
        send(data.target, { type: "call-declined", from: clientId });
      }
      break;

    case "hang-up":
      if (peers[data.target]) {
        console.log(`Relaying 'hang-up' from ${clientId} to ${data.target}`);
        send(data.target, { type: "hang-up", from: clientId });
      }
      break;

    default:
      // Keep old signaling for now, but it will be deprecated
      if (["offer", "answer", "ice-candidate"].includes(data.type)) {
        console.log(`Relaying legacy signal: ${data.type}`);
        if (peers[data.target]) {
          send(data.target, {
            type: data.type,
            from: clientId,
            data: data.data,
            publicKey: data.publicKey, // For offer/answer
          });
        }
        break;
      }
      console.warn(`Unknown message type from ${clientId}: ${data.type}`);
  }
}

async function createWebRtcTransport(clientId) {
  const { webRtcTransport } = config.mediasoup;
  const transport = await router.createWebRtcTransport({
    listenIps: webRtcTransport.listenIps,
    enableUdp: webRtcTransport.enableUdp,
    enableTcp: webRtcTransport.enableTcp,
    preferUdp: webRtcTransport.preferUdp,
    initialAvailableOutgoingBitrate: 1000000,
  });

  transport.on("dtlsstatechange", (dtlsState) => {
    if (dtlsState === "closed") {
      transport.close();
    }
  });

  transport.on("close", () => {
    console.log(`Transport closed for peer ${clientId}`);
  });

  return transport;
}

function send(clientId, message) {
  const peer = peers[clientId];
  if (peer && peer.ws.readyState === WebSocket.OPEN) {
    peer.ws.send(JSON.stringify(message));
  }
}

async function createConsumer(transport, producerId, rtpCapabilities) {
  if (!router.canConsume({ producerId, rtpCapabilities })) {
    console.error("Can not consume");
    return;
  }
  try {
    const consumer = await transport.consume({
      producerId,
      rtpCapabilities,
      paused: true, // Start paused
    });
    return consumer;
  } catch (error) {
    console.error("Consume failed", error);
    return;
  }
}

function broadcastPeerList() {
  const peerList = Object.entries(peers)
    .filter(([id, peer]) => peer.name)
    .map(([id, peer]) => ({ id, name: peer.name }));

  Object.values(peers).forEach((peer) => {
    if (peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.send(JSON.stringify({ type: "peer-list", peers: peerList }));
    }
  });
  console.log(`Broadcast peer list to ${Object.keys(peers).length} clients`);
}

startMediasoup().then(() => {
  server.listen(config.listenPort, config.listenIp, () => {
    console.log(
      `Server running on http://${config.listenIp}:${
        config.listenPort
      } at ${new Date()}`
    );
  });
});
