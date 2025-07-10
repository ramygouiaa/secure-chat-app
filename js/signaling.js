function connectToSignalingServer() {
  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${wsProtocol}//${window.location.host}`;
  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    console.log("Connected to signaling server");
    showNotification("Connected to signaling server.", "info");
  };

  socket.onclose = () => {
    showNotification(
      "Disconnected from signaling server. Reconnecting...",
      "warning"
    );
    setTimeout(connectToSignalingServer, 3000);
  };

  socket.onerror = (err) => {
    console.error("WebSocket error:", err);
    showNotification("Connection error.", "error");
  };

  socket.onmessage = async (event) => {
    const message = JSON.parse(event.data);
    switch (message.type) {
      case "init":
        clientId = message.id;
        document.getElementById("clientIdDisplay").textContent = clientId;
        socket.send(JSON.stringify({ type: "register", name: userName }));
        break;
      case "peer-list":
        updateContactList(message.peers);
        break;
      case "routerRtpCapabilities":
        rtpCapabilities = message.data;
        await createDevice();
        break;
      case "webRtcTransportCreated":
        if (message.data.producing) {
          sendTransport = device.createSendTransport(message.data);
          let connectCallback; // To store the callback for transport.on('connect')
          let produceCallback; // To store the callback for transport.on('produce')

          sendTransport.on(
            "connect",
            async ({ dtlsParameters }, callback, errback) => {
              connectCallback = callback; // Store the callback
              socket.send(
                JSON.stringify({
                  type: "connectTransport",
                  transportId: sendTransport.id,
                  dtlsParameters,
                })
              );
            }
          );
          sendTransport.on(
            "produce",
            async ({ kind, rtpParameters }, callback, errback) => {
              produceCallback = callback; // Store the callback
              socket.send(
                JSON.stringify({
                  type: "produce",
                  transportId: sendTransport.id,
                  kind,
                  rtpParameters,
                })
              );
            }
          );
          await connectSendTransport();
        } else {
          // This is a recv transport
        }
        break;
      case "newProducer":
        console.log("Received newProducer:", message.data);
        // A new peer has joined and is producing media
        await handleNewProducer(message.data.producerId);
        break;
      case "consumed":
        console.log("Received consumed:", message.data);
        await handleConsume(message.data);
        break;
      case "transport-connected":
        console.log("Received transport-connected:", message.transportId);
        // Resolve the stored callback for the send transport
        if (
          sendTransport &&
          sendTransport.id === message.transportId &&
          connectCallback
        ) {
          connectCallback();
          connectCallback = null; // Clear the callback
        }
        break;
      case "producer-created":
        console.log("Received producer-created:", message.producerId);
        if (produceCallback) {
          produceCallback({ id: message.producerId });
          produceCallback = null; // Clear the callback
        }
        break;
      case "key-exchange":
        await handleKeyExchange(message.from, message.publicKey);
        break;
      case "relay":
        await handleIncomingMessage(message.from, message.payload);
        break;
      case "incoming-call":
        handleIncomingCall(message.from, message.name, message.video);
        break;
      case "call-declined":
        handleCallDeclined(message.from);
        break;
      case "hang-up":
        handleHangUp(false); // Don't create a new connection
        break;
      default:
        console.warn(`Unknown message type: ${message.type}`);
        break;
    }
  };
}

async function handleKeyExchange(fromId, publicKeyJwk) {
  if (!myKeys) {
    console.error("Local keys not generated yet.");
    return;
  }
  const publicKey = await importPublicKey(publicKeyJwk);

  // Only derive and set shared secret if it doesn't already exist
  if (!sharedSecrets[fromId]) {
    const secret = await deriveSharedSecret(myKeys.privateKey, publicKey);
    sharedSecrets[fromId] = secret;
    console.log(`Established shared secret with ${fromId}`);

    // Update peer state
    if (peerState[fromId]) {
      peerState[fromId].keyExchangeComplete = true;
    } else {
      peerState[fromId] = {
        keyExchangeComplete: true,
        isConnected: false,
        isTyping: false,
      };
    }

    // Send our public key back if we just established the secret (meaning they initiated)
    sendPublicKey(fromId);
    refreshContactStatus(fromId); // Refresh status for this peer
  } else {
    console.log(
      `Shared secret already exists with ${fromId}. Not re-deriving.`
    );
  }

  // Update UI if this is the current target
  if (fromId === currentTargetId) {
    updateConnectionStatus("Secure connection established.");
  }
  refreshContactStatus(fromId); // Also refresh if it's the current target
}

async function handleIncomingMessage(fromId, payload) {
  try {
    const decryptedData = await decryptMessage(
      base64ToUint8Array(payload),
      fromId
    );
    const message = JSON.parse(new TextDecoder().decode(decryptedData));

    const discussion = getDiscussion(fromId);

    switch (message.type) {
      case "text":
        discussion.messages.push({
          sender: peers[fromId],
          text: message.content,
          timestamp: message.timestamp,
        });
        showNotification(`New message from ${peers[fromId]}`);
        break;
      case "typing":
        if (peerState[fromId]) {
          peerState[fromId].isTyping = true;
          if (fromId === currentTargetId) {
            updateConnectionStatus(`${peers[fromId]} is typing...`);
          }
        }
        return; // Don't save or re-render for this
      case "stop-typing":
        if (peerState[fromId]) {
          peerState[fromId].isTyping = false;
          if (fromId === currentTargetId) {
            updateConnectionStatus("Secure connection established."); // Or original status
          }
        }
        return; // Don't save or re-render for this
      case "file-start":
        fileChunks.set(message.fileId, {
          chunks: [],
          meta: {
            name: message.fileName,
            type: message.fileType,
            timestamp: message.timestamp,
          },
        });
        break;
      case "file-chunk":
        if (fileChunks.has(message.fileId)) {
          fileChunks
            .get(message.fileId)
            .chunks.push(base64ToUint8Array(message.data));
        }
        break;
      case "file-end":
        if (fileChunks.has(message.fileId)) {
          const fileData = fileChunks.get(message.fileId);
          const fileBlob = new Blob(fileData.chunks, {
            type: fileData.meta.type,
          });
          const fileUrl = URL.createObjectURL(fileBlob);
          discussion.messages.push({
            sender: peers[fromId],
            file: { name: fileData.meta.name, url: fileUrl },
            timestamp: fileData.meta.timestamp,
          });
          fileChunks.delete(message.fileId);
          showNotification(`Received file from ${peers[fromId]}`);
        }
        break;
      case "voice":
        const voiceBlob = new Blob([base64ToUint8Array(message.data)], {
          type: "audio/webm",
        });
        const voiceUrl = URL.createObjectURL(voiceBlob);
        discussion.messages.push({
          sender: peers[fromId],
          audioUrl: voiceUrl,
          timestamp: message.timestamp,
        });
        showNotification(`Received voice message from ${peers[fromId]}`);
        break;
    }

    saveDiscussion(fromId, discussion);
    if (fromId === currentTargetId) {
      renderMessages(fromId);
    }
  } catch (error) {
    console.error("Error handling incoming message:", error);
    showNotification("Failed to process incoming message.", "error");
  }
}

function startChatWith(targetId, name) {
  currentTargetId = targetId;
  currentTargetName = name;
  chatWith.textContent = "Chatting with: " + name;
  discussions[targetId] = getDiscussion(targetId);
  renderMessages(targetId);

  // Initialize peer state for the current target
  if (!peerState[targetId]) {
    peerState[targetId] = {
      keyExchangeComplete: false,
      isConnected: false,
      isTyping: false,
    };
  }

  // Initiate key exchange if we don't have a shared secret
  if (!sharedSecrets[targetId]) {
    console.log(`No shared secret for ${targetId}. Initiating key exchange.`);
    sendPublicKey(targetId);
    updateConnectionStatus("Establishing secure connection...");
  } else {
    peerState[targetId].keyExchangeComplete = true;
    updateConnectionStatus("Secure connection established.");
  }
}

async function sendPublicKey(targetId) {
  if (!myKeys) await generateKeys();
  const publicKey = await exportPublicKey(myKeys.publicKey);
  socket.send(
    JSON.stringify({
      type: "key-exchange",
      target: targetId,
      publicKey: publicKey,
    })
  );
  console.log(`Sent public key to ${targetId}`);
}
