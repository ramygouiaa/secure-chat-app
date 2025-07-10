async function initiateCall(video) {
  if (!currentTargetId) {
    showNotification("Please select a contact to call.", "warning");
    return;
  }
  console.log(`Initiating ${video ? "video" : "voice"} call...`);

  isVideoCall = video;
  callStartTime = new Date();

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: isVideoCall
        ? {
            width: { ideal: 1280 },
            height: { ideal: 720 },
          }
        : false,
      audio: true,
    });
    localVideo.srcObject = localStream;
    videoCallDialog.style.display = "block";
    recordBtn.classList.add("hidden");

    // New SFU call flow
    updateConnectionStatus("Calling...");

    // Let the other peer know we're calling
    socket.send(
      JSON.stringify({
        type: "initiate-call",
        target: currentTargetId,
        video: isVideoCall,
      })
    );

    // This will trigger the chain of events to create transport and produce
    await createSendTransport();
  } catch (err) {
    console.error("Error initiating call:", err);
    showNotification(
      "Could not start call. Check camera/mic permissions.",
      "error"
    );
    hangUp();
  }
}

async function answerCall() {
  incomingCallModal.classList.add("hidden");
  stopAudio(ringingSound);
  callStartTime = new Date();

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: isVideoCall,
      audio: true,
    });
    localVideo.srcObject = localStream;

    if (isVideoCall) {
      videoCallDialog.style.display = "block";
    }
    recordBtn.classList.add("hidden");

    updateConnectionStatus("Connecting to media server...");

    await createSendTransport();
    await createRecvTransport();
  } catch (err) {
    console.error("Error answering call:", err);
    showNotification(
      "Could not answer call. Check camera/mic permissions.",
      "error"
    );
    handleHangUp(false);
  }
}

function handleIncomingCall(fromId, fromName, isVideo) {
  // If we're already in a call, we can't accept another.
  if (localStream) {
    console.log("Already in a call, rejecting new call from", fromName);
    // Optionally, send a 'busy' signal back to the caller.
    // socket.send(JSON.stringify({ type: 'busy', target: fromId }));
    return;
  }

  console.log(`Incoming ${isVideo ? "video" : "voice"} call from ${fromName}`);

  // Set global state for the incoming call
  callInitiatorId = fromId;
  isVideoCall = isVideo;
  currentTargetId = fromId; // Set the target to the caller

  // Update and show the modal
  incomingCallText.textContent = isVideo
    ? "Incoming Video Call"
    : "Incoming Voice Call";
  callerName.textContent = fromName || "Unknown";
  incomingCallModal.classList.remove("hidden");
  playAudioWithLoop(ringingSound, 5);
}

// This function will be called from signaling.js when a new producer is announced
async function handleNewProducer(producerId) {
  console.log("New producer detected:", producerId);
  if (!recvTransport) {
    // If we are not yet set up to receive, create a receive transport
    await createRecvTransport();
  }
  // Consume the new producer's stream
  await consume(producerId);
  updateConnectionStatus("Call in progress...");
}

function handleCallDeclined(fromId) {
  showNotification(`${peers[fromId] || "The user"} declined the call.`);
  updateConnectionStatus("Call declined.");
  handleHangUp(false);
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
  updateConnectionStatus("Call declined.");
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
  stopAudio(dialingSound);
  stopAudio(ringingSound);
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

  if (sendTransport) {
    sendTransport.close();
    sendTransport = null;
  }
  if (recvTransport) {
    recvTransport.close();
    recvTransport = null;
  }
  if (videoProducer) {
    videoProducer.close();
    videoProducer = null;
  }
  if (audioProducer) {
    audioProducer.close();
    audioProducer = null;
  }
  // Close all consumers
  consumers.forEach((consumer) => consumer.close());
  consumers = new Map();

  showNotification("Call ended.", "info");
  updateConnectionStatus("Secure connection established.");
}

function toggleMute() {
  if (!localStream) return;
  localStream.getAudioTracks().forEach((track) => {
    track.enabled = !track.enabled;
    muteBtn.innerHTML = track.enabled
      ? '<i class="fas fa-microphone"></i>'
      : '<i class="fas fa-microphone-slash"></i>';
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
