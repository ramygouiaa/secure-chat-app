function createConnection() {
  localConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });

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
}

async function handleOffer(offer, fromId, publicKey) {
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
    connectionStatus.textContent = "Connected";
  };
  dataChannel.onmessage = async (event) => {
    const decryptedData = await decryptMessage(event.data, currentTargetId);
    const message = JSON.parse(new TextDecoder().decode(decryptedData));

    if (message.type === "typing") {
      connectionStatus.textContent = "Typing...";
    } else if (message.type === "stop-typing") {
      connectionStatus.textContent = "Connected";
    } else if (message.type === "file-start") {
      fileChunks.set(message.fileId, {
        chunks: [],
        meta: { name: message.fileName, type: message.fileType },
      });
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
        messages.push({
          sender: currentTargetName,
          file: { name: fileData.meta.name, url: fileUrl },
        });
        renderMessages();
        fileChunks.delete(message.fileId);
      }
    } else if (message.type === "text") {
      messages.push({ sender: currentTargetName, text: message.content });
      renderMessages();
    } else if (message.type === "voice") {
      const audioBlob = new Blob([base64ToUint8Array(message.data)], {
        type: "audio/webm",
      });
      const audioUrl = URL.createObjectURL(audioBlob);
      messages.push({ sender: currentTargetName, audioUrl: audioUrl });
      renderMessages();
    } else if (message.audioUrl) {
      messages.push({
        sender: currentTargetName,
        audioUrl: message.audioUrl,
      });
      renderMessages();
    }
  };
}

async function initiateCall(video) {
  if (!currentTargetId) {
    showNotification("Please select a contact to call.", "warning");
    return;
  }
  if (!localConnection || localConnection.connectionState !== "connected") {
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
      videoContainer.classList.remove("hidden");
      messagesContainer.classList.add("hidden");
    }
    hangUpBtn.classList.remove("hidden");

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
}

async function answerCall() {
  incomingCallModal.classList.add("hidden");

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
      videoContainer.classList.remove("hidden");
      messagesContainer.classList.add("hidden");
    }
    hangUpBtn.classList.remove("hidden");

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
  showNotification("Call connected!", "info");
}

function declineCall() {
  incomingCallModal.classList.add("hidden");
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
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
    localStream = null;
  }

  videoContainer.classList.add("hidden");
  messagesContainer.classList.remove("hidden");
  hangUpBtn.classList.add("hidden");
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
