sendBtn.onclick = sendMessage;
recordBtn.onclick = toggleRecording;
fileBtn.onclick = () => fileInput.click();
fileInput.onchange = handleFileSelect;
voiceCallBtn.onclick = () => initiateCall(false);
videoCallBtn.onclick = () => initiateCall(true);
hangUpBtn.onclick = hangUp;
muteBtn.onclick = toggleMute;
openSidebarBtn.onclick = () => sidebar.classList.remove("hidden");
closeSidebarBtn.onclick = () => sidebar.classList.add("hidden");
answerCallBtn.onclick = answerCall;
declineCallBtn.onclick = declineCall;

forceRelayToggle.addEventListener("change", (event) => {
  forceRelay = event.target.checked;
  showNotification(
    `Forced relay is now ${forceRelay ? "ON" : "OFF"}. Reconnect to apply.`,
    "info"
  );
  if (currentTargetId) {
    // Re-establish connection with the new setting
    createConnection();
  }
});

contactSearchInput.addEventListener("input", filterContacts);

messageInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    sendMessage();
  } else {
    handleTyping();
  }
});

messageInput.addEventListener("input", () => {
  if (messageInput.value.trim().length > 0) {
    sendBtn.classList.remove("hidden");
    recordBtn.classList.add("hidden");
  } else {
    sendBtn.classList.add("hidden");
    recordBtn.classList.remove("hidden");
  }
});

async function sendData(data) {
  try {
    const encryptedData = await encryptMessage(
      JSON.stringify(data),
      currentTargetId
    );

    if (
      forceRelay ||
      isRelayActive ||
      !dataChannel ||
      dataChannel.readyState !== "open"
    ) {
      // Fallback to WebSocket relay
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: "relay",
            target: currentTargetId,
            payload: arrayBufferToBase64(encryptedData),
          })
        );
        console.log("Sent message via relay");
      } else {
        showNotification("Cannot send message. No connection.", "error");
        console.error("Cannot send message. WebSocket is not open.");
      }
    } else {
      // Send via WebRTC
      dataChannel.send(encryptedData);
      console.log("Sent message via WebRTC");
    }
  } catch (error) {
    console.error("Error sending data:", error);
    showNotification("Failed to send message.", "error");
  }
}

async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !currentTargetId) return;

  const message = {
    id: crypto.randomUUID(),
    type: "text",
    content: text,
    timestamp: new Date().toISOString(),
    status: "sent",
  };

  // Update UI immediately
  const discussion = getDiscussion(currentTargetId);
  discussion.messages.push({
    id: message.id,
    sender: "You",
    text: text,
    timestamp: message.timestamp,
    status: "sent",
  });
  saveDiscussion(currentTargetId, discussion);
  renderMessages(currentTargetId);
  messageInput.value = "";
  sendBtn.classList.add("hidden");
  recordBtn.classList.remove("hidden");

  await sendData(message);
}

function handleTyping() {
  if (!currentTargetId) return;
  const typingMessage = { type: "typing" };
  sendData(typingMessage);

  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    const stopTypingMessage = { type: "stop-typing" };
    sendData(stopTypingMessage);
  }, 1000);
}

async function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file || !currentTargetId) return;

  const CHUNK_SIZE = 16384; // 16KB
  const fileId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const messageId = crypto.randomUUID();

  // Update UI immediately
  const fileUrl = URL.createObjectURL(file);
  const discussion = getDiscussion(currentTargetId);
  discussion.messages.push({
    id: messageId,
    sender: "You",
    file: { name: file.name, url: fileUrl },
    timestamp: timestamp,
    status: "sent",
  });
  saveDiscussion(currentTargetId, discussion);
  renderMessages(currentTargetId);

  // Send file in chunks
  const startMessage = {
    type: "file-start",
    messageId: messageId,
    fileId: fileId,
    fileName: file.name,
    fileType: file.type,
    timestamp: timestamp,
  };
  await sendData(startMessage);

  const arrayBuffer = await file.arrayBuffer();
  for (let i = 0; i < arrayBuffer.byteLength; i += CHUNK_SIZE) {
    const chunk = arrayBuffer.slice(i, i + CHUNK_SIZE);
    const chunkMessage = {
      type: "file-chunk",
      fileId: fileId,
      data: arrayBufferToBase64(chunk),
    };
    await sendData(chunkMessage);
  }

  const endMessage = { type: "file-end", fileId: fileId };
  await sendData(endMessage);
}

async function toggleRecording() {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    recordBtn.innerHTML = '<i class="fas fa-microphone"></i>';
  } else {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunks.push(event.data);
        }
      };
      mediaRecorder.onstop = async () => {
        mediaRecorder.stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(recordedChunks, { type: "audio/webm" });
        recordedChunks = [];
        const timestamp = new Date().toISOString();
        const messageId = crypto.randomUUID();

        // Update UI immediately
        const audioUrl = URL.createObjectURL(blob);
        const discussion = getDiscussion(currentTargetId);
        discussion.messages.push({
          id: messageId,
          sender: "You",
          audioUrl: audioUrl,
          timestamp: timestamp,
          status: "sent",
        });
        saveDiscussion(currentTargetId, discussion);
        renderMessages(currentTargetId);

        // Send the voice message
        const arrayBuffer = await blob.arrayBuffer();
        const message = {
          id: messageId,
          type: "voice",
          data: arrayBufferToBase64(arrayBuffer),
          timestamp: timestamp,
        };
        await sendData(message);
      };
      mediaRecorder.start();
      recordBtn.innerHTML = '<i class="fas fa-stop"></i>';
    } catch (err) {
      console.error("Error accessing microphone:", err);
      showNotification("Could not access microphone.", "error");
    }
  }
}
