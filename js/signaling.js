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
    if (message.type === "init") {
      clientId = message.id;
      document.getElementById("clientIdDisplay").textContent = clientId;
      socket.send(JSON.stringify({ type: "register", name: userName }));
    } else if (message.type === "peer-list") {
      updateContactList(message.peers);
    } else if (message.type === "offer") {
      await handleOffer(message.data, message.from, message.publicKey);
    } else if (message.type === "answer") {
      await handleAnswer(message.data, message.from, message.publicKey);
    } else if (message.type === "relay-key-exchange") {
      await handleRelayKeyExchange(message.from, message.publicKey);
    } else if (message.type === "relay-key-exchange-ack") {
      await handleRelayKeyExchangeAck(message.from, message.publicKey);
    } else if (message.type === "ice-candidate") {
      await localConnection.addIceCandidate(message.data);
    } else if (message.type === "relay") {
      await handleIncomingMessage(
        base64ToUint8Array(message.payload),
        message.from
      );
    } else if (message.type === "server-shutdown") {
      showNotification(message.message, "error");
      socket.close();
    } else if (message.type === "video-offer") {
      await handleCallOffer(message.data, message.from, true);
    } else if (message.type === "voice-offer") {
      await handleCallOffer(message.data, message.from, false);
    } else if (
      message.type === "video-answer" ||
      message.type === "voice-answer"
    ) {
      await handleCallAnswer(message.data);
    } else if (message.type === "hang-up") {
      handleHangUp(true);
    } else if (message.type === "decline-call") {
      showNotification(`${peers[message.from]} declined the call.`, "warning");
      handleHangUp(false); // Don't send another hangup message
    }
  };
}

function startChatWith(targetId, name) {
  currentTargetId = targetId;
  currentTargetName = name;
  chatWith.textContent = "Chatting with: " + name;
  discussions[targetId] = getDiscussion(targetId);
  renderMessages(targetId);
  createConnection();
}
