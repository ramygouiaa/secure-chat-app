function createConnection() {
  if (forceRelay) {
    activateRelayFallback();
    initiateRelayKeyExchange();
    return;
  }
  localConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  isRelayActive = false; // Reset relay state on new connection

  const connectionTimeout = setTimeout(() => {
    if (
      localConnection.connectionState !== "connected" &&
      localConnection.connectionState !== "completed"
    ) {
      console.warn("WebRTC connection timed out. Falling back to relay.");
      activateRelayFallback();
    }
  }, 15000); // 15-second timeout

  dataChannel = localConnection.createDataChannel("chat");
  setupDataChannel(dataChannel);

  localConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.send(
        JSON.stringify({
          type: "ice-candidate",
          data: event.candidate,
          target: currentTargetId,
        })
      );
    }
  };

  localConnection.ondatachannel = (event) => {
    setupDataChannel(event.channel);
  };

  localConnection.onconnectionstatechange = () => {
    connectionStatus.textContent = localConnection.connectionState;
    if (
      localConnection.connectionState === "failed" ||
      localConnection.connectionState === "disconnected"
    ) {
      console.error("WebRTC connection failed. Falling back to relay.");
      activateRelayFallback();
    } else if (localConnection.connectionState === "connected") {
      clearTimeout(connectionTimeout);
      console.log("WebRTC connection established successfully.");
      isRelayActive = false;
      connectionStatus.textContent = "Connected (WebRTC)";
    }
  };

  localConnection.ontrack = (event) => {
    const stream = event.streams[0];
    if (stream.getVideoTracks().length > 0) {
      remoteVideo.srcObject = stream;
    } else {
      remoteAudio.srcObject = stream;
    }
  };

  localConnection
    .createOffer()
    .then((offer) => localConnection.setLocalDescription(offer))
    .then(async () => {
      const exportedPublicKey = await exportPublicKey(myKeys.publicKey);
      socket.send(
        JSON.stringify({
          type: "offer",
          data: localConnection.localDescription,
          publicKey: exportedPublicKey,
          target: currentTargetId,
        })
      );
    });
}

async function handleAnswer(answer, fromId, publicKey) {
  const remotePublicKey = await importPublicKey(publicKey);
  const sharedSecret = await deriveSharedSecret(
    myKeys.privateKey,
    remotePublicKey
  );
  sharedSecrets[fromId] = sharedSecret;
  console.log(`Shared secret established with ${peers[fromId]}`);
  await localConnection.setRemoteDescription(new RTCSessionDescription(answer));

  // Process any queued ICE candidates
  if (iceCandidateQueues[fromId]) {
    for (const candidate of iceCandidateQueues[fromId]) {
      await localConnection.addIceCandidate(candidate);
    }
    delete iceCandidateQueues[fromId];
  }
}

async function initiateRelayKeyExchange() {
  const exportedPublicKey = await exportPublicKey(myKeys.publicKey);
  socket.send(
    JSON.stringify({
      type: "relay-key-exchange",
      publicKey: exportedPublicKey,
      target: currentTargetId,
    })
  );
}

async function handleRelayKeyExchange(fromId, publicKey) {
  const remotePublicKey = await importPublicKey(publicKey);
  const sharedSecret = await deriveSharedSecret(
    myKeys.privateKey,
    remotePublicKey
  );
  sharedSecrets[fromId] = sharedSecret;
  console.log(`Shared secret established via relay with ${peers[fromId]}`);

  // Acknowledge the key exchange
  const exportedPublicKey = await exportPublicKey(myKeys.publicKey);
  socket.send(
    JSON.stringify({
      type: "relay-key-exchange-ack",
      publicKey: exportedPublicKey,
      target: fromId,
    })
  );
  connectionStatus.textContent = "Connected (Relay)";
  renderMessages(fromId);
}

async function handleRelayKeyExchangeAck(fromId, publicKey) {
  const remotePublicKey = await importPublicKey(publicKey);
  const sharedSecret = await deriveSharedSecret(
    myKeys.privateKey,
    remotePublicKey
  );
  sharedSecrets[fromId] = sharedSecret;
  console.log(`Shared secret acknowledged via relay with ${peers[fromId]}`);
  connectionStatus.textContent = "Connected (Relay)";
  renderMessages(fromId);
}

async function handleOffer(offer, fromId, publicKey) {
  if (forceRelay) {
    console.log("Ignoring WebRTC offer while in forced relay mode.");
    return;
  }
  currentTargetId = fromId;
  currentTargetName = peers[fromId];
  chatWith.textContent = "Chatting with: " + currentTargetName;

  localConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  localConnection.ondatachannel = (event) => setupDataChannel(event.channel);

  localConnection.ontrack = (event) => {
    const stream = event.streams[0];
    if (stream.getVideoTracks().length > 0) {
      remoteVideo.srcObject = stream;
    } else {
      remoteAudio.srcObject = stream;
    }
  };

  localConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.send(
        JSON.stringify({
          type: "ice-candidate",
          data: event.candidate,
          target: currentTargetId,
        })
      );
    }
  };

  await localConnection.setRemoteDescription(new RTCSessionDescription(offer));

  const remotePublicKey = await importPublicKey(publicKey);
  const sharedSecret = await deriveSharedSecret(
    myKeys.privateKey,
    remotePublicKey
  );
  sharedSecrets[fromId] = sharedSecret;
  console.log(`Shared secret established with ${peers[fromId]}`);

  const answer = await localConnection.createAnswer();
  await localConnection.setLocalDescription(answer);

  // Process any queued ICE candidates
  if (iceCandidateQueues[fromId]) {
    for (const candidate of iceCandidateQueues[fromId]) {
      await localConnection.addIceCandidate(candidate);
    }
    delete iceCandidateQueues[fromId];
  }

  const exportedPublicKey = await exportPublicKey(myKeys.publicKey);
  socket.send(
    JSON.stringify({
      type: "answer",
      data: answer,
      publicKey: exportedPublicKey,
      target: currentTargetId,
    })
  );
}

function setupDataChannel(channel) {
  dataChannel = channel;
  dataChannel.onopen = () => {
    connectionStatus.textContent = "Connected (WebRTC)";
    isRelayActive = false;
    renderMessages(currentTargetId);
  };
  dataChannel.onmessage = (event) => {
    handleIncomingMessage(event.data, currentTargetId);
  };
  dataChannel.onclose = () => {
    console.warn("Data channel closed.");
    // activateRelayFallback(); // Fallback if data channel closes unexpectedly
  };
}

function activateRelayFallback() {
  if (isRelayActive) return; // Already active
  isRelayActive = true;
  connectionStatus.textContent = "Connected (Relay)";
  showNotification("WebRTC connection failed. Using relay server.", "warning");
  // No need to close the localConnection, let it keep trying to connect
}

async function handleIncomingMessage(data, senderId) {
  try {
    let message;
    try {
      message = JSON.parse(new TextDecoder().decode(data));
    } catch (error) {
      const decryptedData = await decryptMessage(data, senderId);
      message = JSON.parse(new TextDecoder().decode(decryptedData));
    }
    const discussion = getDiscussion(senderId);

    if (message.type === "typing") {
      connectionStatus.textContent = "Typing...";
    } else if (message.type === "stop-typing") {
      connectionStatus.textContent = isRelayActive
        ? "Connected (Relay)"
        : "Connected (WebRTC)";
    } else if (message.type === "file-start") {
      fileChunks.set(message.fileId, {
        chunks: [],
        meta: {
          name: message.fileName,
          type: message.fileType,
          timestamp: message.timestamp,
          messageId: message.messageId,
        },
      });
      if (senderId !== clientId) {
        socket.send(
          JSON.stringify({
            type: "message-status",
            status: "delivered",
            messageIds: [message.messageId],
            target: senderId,
          })
        );
      }
    } else if (message.type === "file-chunk") {
      const fileData = fileChunks.get(message.fileId);
      if (fileData) {
        const chunk = base64ToUint8Array(message.data);
        fileData.chunks.push(chunk);
      }
    } else if (message.type === "file-end") {
      const fileData = fileChunks.get(message.fileId);
      if (fileData) {
        const fileBlob = new Blob(fileData.chunks, {
          type: fileData.meta.type,
        });
        const fileUrl = URL.createObjectURL(fileBlob);
        discussion.messages.push({
          id: fileData.meta.messageId,
          sender: peers[senderId],
          file: { name: fileData.meta.name, url: fileUrl },
          timestamp: fileData.meta.timestamp,
        });
        saveDiscussion(senderId, discussion);
        renderMessages(senderId);
        fileChunks.delete(message.fileId);
      }
    } else if (message.type === "text") {
      discussion.messages.push({
        id: message.id,
        sender: peers[senderId],
        text: message.content,
        timestamp: message.timestamp,
      });
      saveDiscussion(senderId, discussion);
      renderMessages(senderId);
      if (senderId !== clientId) {
        socket.send(
          JSON.stringify({
            type: "message-status",
            status: "delivered",
            messageIds: [message.id],
            target: senderId,
          })
        );
      }
    } else if (message.type === "voice") {
      const audioBlob = new Blob([base64ToUint8Array(message.data)], {
        type: "audio/webm",
      });
      const audioUrl = URL.createObjectURL(audioBlob);
      discussion.messages.push({
        id: message.id,
        sender: peers[senderId],
        audioUrl: audioUrl,
        timestamp: message.timestamp,
      });
      saveDiscussion(senderId, discussion);
      renderMessages(senderId);
      if (senderId !== clientId) {
        socket.send(
          JSON.stringify({
            type: "message-status",
            status: "delivered",
            messageIds: [message.id],
            target: senderId,
          })
        );
      }
    } else if (message.type === "message-status") {
      const discussion = getDiscussion(currentTargetId);
      message.messageIds.forEach((messageId) => {
        const msg = discussion.messages.find((m) => m.id === messageId);
        if (msg) {
          msg.status = message.status;
        }
      });
      saveDiscussion(currentTargetId, discussion);
      renderMessages(currentTargetId);
    }
  } catch (error) {
    console.error("Error processing incoming message:", error);
  }
}

async function initiateCall(video) {
  if (!manualStatusOverride) {
    sendStatusUpdate("In call");
  }
  callStartTime = new Date();
  if (!currentTargetId) {
    showNotification("Please select a contact to call.", "warning");
    return;
  }
  if (
    !isRelayActive &&
    (!localConnection || localConnection.connectionState !== "connected")
  ) {
    showNotification(
      "You must be connected to a peer to start a call.",
      "error"
    );
    return;
  }

  isVideoCall = video;

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: isVideoCall,
      audio: true,
    });
    localVideo.srcObject = localStream;
    localStream
      .getTracks()
      .forEach((track) => localConnection.addTrack(track, localStream));

    if (isVideoCall) {
      videoCallDialog.style.display = "block";
    } else {
      voiceCallBtn.classList.add("hidden");
      videoCallBtn.classList.add("hidden");
      voiceMuteBtn.classList.remove("hidden");
      voiceHangUpBtn.classList.remove("hidden");
    }
    recordBtn.classList.add("hidden");
    playAudioWithLoop(dialingSound, 5);

    const offer = await localConnection.createOffer();
    await localConnection.setLocalDescription(offer);

    socket.send(
      JSON.stringify({
        type: isVideoCall ? "video-offer" : "voice-offer",
        data: offer,
        target: currentTargetId,
      })
    );

    showNotification(`Calling ${currentTargetName}...`, "info");
  } catch (err) {
    console.error(
      `Error starting ${isVideoCall ? "video" : "voice"} call:`,
      err
    );
    showNotification(
      `Could not start ${
        isVideoCall ? "video" : "voice"
      } call. Check camera/mic permissions.`,
      "error"
    );
  }
}

async function handleCallOffer(offer, fromId, isVideo) {
  if (
    localConnection &&
    localConnection.connectionState === "connected" &&
    localStream
  ) {
    console.log("Already in a call, rejecting new offer.");
    socket.send(JSON.stringify({ type: "decline-call", target: fromId }));
    return;
  }

  incomingOffer = offer;
  callInitiatorId = fromId;
  isVideoCall = isVideo;

  incomingCallText.textContent = isVideo
    ? "Incoming Video Call"
    : "Incoming Voice Call";
  callerName.textContent = peers[fromId] || "Unknown";
  incomingCallModal.classList.remove("hidden");
  playAudioWithLoop(ringingSound, 5);
}

async function answerCall() {
  incomingCallModal.classList.add("hidden");
  stopAudio(ringingSound);
  callStartTime = new Date();
  if (!manualStatusOverride) {
    sendStatusUpdate("In call");
  }

  if (!localConnection) {
    console.error("No local connection to answer call");
    return;
  }

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: isVideoCall,
      audio: true,
    });
    localVideo.srcObject = localStream;
    localStream
      .getTracks()
      .forEach((track) => localConnection.addTrack(track, localStream));

    if (isVideoCall) {
      videoCallDialog.style.display = "block";
    } else {
      voiceCallBtn.classList.add("hidden");
      videoCallBtn.classList.add("hidden");
      voiceMuteBtn.classList.remove("hidden");
      voiceHangUpBtn.classList.remove("hidden");
    }
    recordBtn.classList.add("hidden");

    await localConnection.setRemoteDescription(
      new RTCSessionDescription(incomingOffer)
    );
    const answer = await localConnection.createAnswer();
    await localConnection.setLocalDescription(answer);

    socket.send(
      JSON.stringify({
        type: isVideoCall ? "video-answer" : "voice-answer",
        data: answer,
        target: callInitiatorId,
      })
    );

    currentTargetId = callInitiatorId;
    currentTargetName = peers[callInitiatorId];
    chatWith.textContent = "Chatting with: " + currentTargetName;

    incomingOffer = null;
    callInitiatorId = null;
  } catch (err) {
    console.error("Error answering call:", err);
    showNotification(
      "Could not answer call. Check camera/mic permissions.",
      "error"
    );
  }
}

async function handleCallAnswer(answer) {
  await localConnection.setRemoteDescription(new RTCSessionDescription(answer));
  stopAudio(dialingSound);
  showNotification("Call connected!", "info");
}

function declineCall() {
  incomingCallModal.classList.add("hidden");
  stopAudio(ringingSound);
  socket.send(
    JSON.stringify({
      type: "decline-call",
      target: callInitiatorId,
    })
  );
  incomingOffer = null;
  callInitiatorId = null;
}

function hangUp() {
  socket.send(
    JSON.stringify({
      type: "hang-up",
      target: currentTargetId,
    })
  );
  handleHangUp(true);
}

function handleHangUp(shouldCreateNewConnection = true) {
  if (!manualStatusOverride) {
    sendStatusUpdate("Online");
  }
  stopAudio(dialingSound);
  stopAudio(ringingSound);
  voiceCallBtn.classList.remove("hidden");
  videoCallBtn.classList.remove("hidden");
  voiceMuteBtn.classList.add("hidden");
  voiceHangUpBtn.classList.add("hidden");
  if (incomingOffer && !localStream) {
    incomingCallModal.classList.add("hidden");
    const discussion = getDiscussion(callInitiatorId);
    discussion.calls.push({
      type: isVideoCall ? "video" : "voice",
      status: "missed",
      timestamp: new Date().toISOString(),
    });
    saveDiscussion(callInitiatorId, discussion);
    renderMessages(callInitiatorId);
  } else if (callStartTime) {
    const callEndTime = new Date();
    const duration = Math.round((callEndTime - callStartTime) / 1000);
    const discussion = getDiscussion(currentTargetId);
    discussion.calls.push({
      type: isVideoCall ? "video" : "voice",
      duration: duration,
      timestamp: callEndTime.toISOString(),
      status: "ended",
    });
    saveDiscussion(currentTargetId, discussion);
    renderMessages(currentTargetId);
    callStartTime = null;
  }
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
    localStream = null;
  }

  videoCallDialog.style.display = "none";
  resetVideoDialog();
  recordBtn.classList.remove("hidden");
  remoteVideo.srcObject = null;
  remoteAudio.srcObject = null;
  localVideo.srcObject = null;

  if (localConnection) {
    localConnection.close();
    localConnection = null;
  }

  if (shouldCreateNewConnection && currentTargetId) {
    createConnection();
  }
  showNotification("Call ended.", "info");
}

function toggleMute() {
  if (!localStream) return;
  localStream.getAudioTracks().forEach((track) => {
    track.enabled = !track.enabled;
    const icon = track.enabled
      ? '<i class="fas fa-microphone"></i>'
      : '<i class="fas fa-microphone-slash"></i>';
    muteBtn.innerHTML = icon;
    voiceMuteBtn.innerHTML = icon;
  });
}

function playAudioWithLoop(audioElement, loopCount) {
  let playedCount = 0;
  audioElement.currentTime = 0;
  const playPromise = audioElement.play();
  if (playPromise !== undefined) {
    playPromise
      .then((_) => {
        // Autoplay started!
      })
      .catch((error) => {
        // Autoplay was prevented.
        console.error("Autoplay prevented: ", error);
      });
  }
  playedCount++;

  audioElement.onended = () => {
    if (playedCount < loopCount) {
      audioElement.currentTime = 0;
      audioElement.play();
      playedCount++;
    }
  };
}

function stopAudio(audioElement) {
  audioElement.pause();
  audioElement.currentTime = 0;
  audioElement.onended = null;
}
