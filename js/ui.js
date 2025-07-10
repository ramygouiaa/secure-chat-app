function showNotification(message, type = "info") {
  notification.textContent = message;
  notification.className =
    "fixed top-0 left-0 right-0 p-4 text-white text-center z-50"; // Reset classes
  if (type === "error") {
    notification.classList.add("bg-red-600");
  } else if (type === "warning") {
    notification.classList.add("bg-yellow-600");
  } else {
    notification.classList.add("bg-blue-600");
  }
  notification.classList.remove("hidden");
  setTimeout(() => {
    notification.classList.add("hidden");
  }, 5000);
}

let allPeers = []; // Store the full list of peers

function updateContactList(peerArray) {
  allPeers = peerArray; // Store the original list
  filterContacts(); // Call filter to render the list
}

function filterContacts() {
  contactsList.innerHTML = "";
  peers = {};
  const searchTerm = contactSearchInput.value.toLowerCase();

  allPeers.forEach((peer) => {
    if (peer.id !== clientId) {
      peers[peer.id] = peer.name;
      if (!sessionStorage.getItem(peer.id)) {
        saveDiscussion(peer.id, { messages: [], calls: [] });
      }

      if (peer.name.toLowerCase().includes(searchTerm)) {
        const item = document.createElement("div");
        item.className =
          "contact-item flex items-center gap-3 p-2 hover:bg-gray-700 rounded cursor-pointer";
        item.dataset.id = peer.id;
        item.innerHTML = `
          <div class="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
            <span class="text-white text-sm">${peer.name.charAt(0)}</span>
          </div>
          <div class="flex-1">
            <div class="text-sm font-medium">${peer.name}</div>
            <div class="text-xs text-gray-400" id="status-${peer.id}">
              ${
                peerState[peer.id] && peerState[peer.id].keyExchangeComplete
                  ? "Securely Connected"
                  : "Connecting..."
              }
            </div>
          </div>
          <div
            id="status-dot-${peer.id}"
            class="w-2 h-2 ${
              peerState[peer.id] && peerState[peer.id].keyExchangeComplete
                ? "bg-green-500"
                : "bg-yellow-500"
            } rounded-full"
          ></div>
        `;
        item.onclick = () => startChatWith(peer.id, peer.name);
        contactsList.appendChild(item);
      }
    }
  });
}

function renderMessages(peerId) {
  const discussion = getDiscussion(peerId);
  if (!discussion) return;

  const allItems = [
    ...discussion.messages.map((item) => ({ ...item, itemType: "message" })),
    ...discussion.calls.map((item) => ({ ...item, itemType: "call" })),
  ];

  allItems.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const itemsHtml = allItems
    .map((item) => {
      if (item.itemType === "message") {
        const msg = item;
        const time = new Date(msg.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        return `
      <div class="flex ${
        msg.sender === "You" ? "justify-end" : "justify-start"
      }">
        <div class="bg-${
          msg.sender === "You" ? "green" : "gray"
        }-700 px-4 py-2 rounded-lg max-w-xs">
          ${msg.text ? `<span class="text-sm">${msg.text}</span>` : ""}
          ${
            msg.audioUrl ? `<audio controls src="${msg.audioUrl}"></audio>` : ""
          }
          ${
            msg.file
              ? `<a href="${msg.file.url}" download="${msg.file.name}" class="text-blue-300 hover:underline">${msg.file.name}</a>`
              : ""
          }
          <div class="text-xs text-gray-400 text-right mt-1">${time}</div>
        </div>
      </div>
    `;
      } else {
        // item.itemType === 'call'
        const call = item;
        const time = new Date(call.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        const duration = call.status === "ended" ? `(${call.duration}s)` : "";
        return `
      <div class="text-center text-gray-500 text-xs my-2">
        ${call.type === "video" ? "Video" : "Voice"} Call ${
          call.status
        } ${duration} - ${time}
      </div>
    `;
      }
    })
    .join("");

  messagesContainer.innerHTML = itemsHtml;
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function refreshContactStatus(peerId) {
  const statusElement = document.getElementById(`status-${peerId}`);
  const statusDotElement = document.getElementById(`status-dot-${peerId}`);

  if (statusElement && statusDotElement && peerState[peerId]) {
    statusElement.textContent = peerState[peerId].keyExchangeComplete
      ? "Securely Connected"
      : "Connecting...";
    statusDotElement.className = `w-2 h-2 ${
      peerState[peerId].keyExchangeComplete ? "bg-green-500" : "bg-yellow-500"
    } rounded-full`;
  }
}

function getDiscussion(peerId) {
  const discussion = sessionStorage.getItem(peerId);
  return discussion ? JSON.parse(discussion) : { messages: [], calls: [] };
}

function saveDiscussion(peerId, discussion) {
  sessionStorage.setItem(peerId, JSON.stringify(discussion));
}

function updateConnectionStatus(status) {
  connectionStatus.textContent = status;
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToUint8Array(base64) {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes;
}

// Make the video call dialog draggable
let isDragging = false;
let offsetX, offsetY;

videoCallHeader.addEventListener("mousedown", (e) => {
  isDragging = true;
  offsetX = e.clientX - videoCallDialog.offsetLeft;
  offsetY = e.clientY - videoCallDialog.offsetTop;
  videoCallDialog.style.cursor = "grabbing";
});

document.addEventListener("mousemove", (e) => {
  if (isDragging) {
    videoCallDialog.style.left = `${e.clientX - offsetX}px`;
    videoCallDialog.style.top = `${e.clientY - offsetY}px`;
  }
});

document.addEventListener("mouseup", () => {
  isDragging = false;
  videoCallDialog.style.cursor = "default";
});

function resetVideoDialog() {
  videoCallDialog.style.top = "";
  videoCallDialog.style.left = "";
  videoCallDialog.style.width = "";
  videoCallDialog.style.height = "";
}
