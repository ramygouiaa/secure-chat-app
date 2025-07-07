sendBtn.onclick = sendMessage;
recordBtn.onclick = toggleRecording;
fileBtn.onclick = () => fileInput.click();
fileInput.onchange = handleFileSelect;
voiceCallBtn.onclick = () => initiateCall(false);
videoCallBtn.onclick = () => initiateCall(true);
hangUpBtn.onclick = hangUp;
openSidebarBtn.onclick = () => sidebar.classList.remove("hidden");
closeSidebarBtn.onclick = () => sidebar.classList.add("hidden");
answerCallBtn.onclick = answerCall;
declineCallBtn.onclick = declineCall;
muteBtn.onclick = toggleMute;

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

async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !dataChannel || dataChannel.readyState !== "open") return;

  const message = {
    type: "text",
    content: text,
    timestamp: new Date().toISOString(),
  };
  const discussion = getDiscussion(currentTargetId);
  discussion.messages.push({
    sender: "You",
    text: text,
    timestamp: message.timestamp,
  });
  saveDiscussion(currentTargetId, discussion);

  const encryptedMessage = await encryptMessage(
    JSON.stringify(message),
    currentTargetId
  );
  dataChannel.send(encryptedMessage);
  renderMessages(currentTargetId);
  messageInput.value = "";
  sendBtn.classList.add("hidden");
  recordBtn.classList.remove("hidden");
}

function handleTyping() {
  if (dataChannel && dataChannel.readyState === "open") {
    const typingMessage = JSON.stringify({ type: "typing" });
    encryptMessage(typingMessage, currentTargetId).then((encrypted) => {
      dataChannel.send(encrypted);
    });
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      const stopTypingMessage = JSON.stringify({ type: "stop-typing" });
      encryptMessage(stopTypingMessage, currentTargetId).then((encrypted) => {
        dataChannel.send(encrypted);
      });
    }, 1000);
  }
}

async function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  const CHUNK_SIZE = 16384; // 16KB
  const fileId = crypto.randomUUID();

  const timestamp = new Date().toISOString();
  const startMessage = {
    type: "file-start",
    fileId: fileId,
    fileName: file.name,
    fileType: file.type,
    timestamp: timestamp,
  };

  const sendFile = async () => {
    dataChannel.send(
      await encryptMessage(JSON.stringify(startMessage), currentTargetId)
    );

    const arrayBuffer = await file.arrayBuffer();
    for (let i = 0; i < arrayBuffer.byteLength; i += CHUNK_SIZE) {
      const chunk = arrayBuffer.slice(i, i + CHUNK_SIZE);
      const chunkMessage = {
        type: "file-chunk",
        fileId: fileId,
        data: arrayBufferToBase64(chunk),
      };
      dataChannel.send(
        await encryptMessage(JSON.stringify(chunkMessage), currentTargetId)
      );
    }

    const endMessage = { type: "file-end", fileId: fileId };
    dataChannel.send(
      await encryptMessage(JSON.stringify(endMessage), currentTargetId)
    );
  };

  if (dataChannel && dataChannel.readyState === "open") {
    sendFile();
  } else {
    const onDataChannelOpen = () => {
      sendFile();
      dataChannel.removeEventListener("open", onDataChannelOpen);
    };
    dataChannel.addEventListener("open", onDataChannelOpen);
  }

  const fileUrl = URL.createObjectURL(file);
  const discussion = getDiscussion(currentTargetId);
  discussion.messages.push({
    sender: "You",
    file: { name: file.name, url: fileUrl },
    timestamp: timestamp,
  });
  saveDiscussion(currentTargetId, discussion);
  renderMessages(currentTargetId);
}

async function toggleRecording() {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    recordBtn.innerHTML = '<i class="fas fa-microphone"></i>';
  } else {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };
    mediaRecorder.onstop = async () => {
      const blob = new Blob(recordedChunks, { type: "audio/webm" });
      recordedChunks = [];
      const audioUrl = URL.createObjectURL(blob);
      const timestamp = new Date().toISOString();
      const discussion = getDiscussion(currentTargetId);
      discussion.messages.push({
        sender: "You",
        audioUrl: audioUrl,
        timestamp: timestamp,
      });
      saveDiscussion(currentTargetId, discussion);
      renderMessages(currentTargetId);

      const arrayBuffer = await blob.arrayBuffer();
      const message = {
        type: "voice",
        data: arrayBufferToBase64(arrayBuffer),
        timestamp: timestamp,
      };
      const encryptedVoiceMessage = await encryptMessage(
        JSON.stringify(message),
        currentTargetId
      );
      dataChannel.send(encryptedVoiceMessage);
    };
    mediaRecorder.start();
    recordBtn.innerHTML = '<i class="fas fa-stop"></i>';
  }
}
