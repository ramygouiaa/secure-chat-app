export class ChatView {
  constructor() {
    this.messagesContainer = document.getElementById("messagesContainer");
    this.messageInput = document.getElementById("messageInput");
    this.chatHeader = document.getElementById("chatHeader");
  }

  addMessage(message, senderName, isOwn) {
    if (!this.messagesContainer) return;

    const messageElement = document.createElement("div");
    messageElement.className = `message ${isOwn ? "own" : "other"} mb-4`;

    // Handle different message formats
    let content;
    if (typeof message === "string") {
      content = message;
    } else if (message && typeof message === "object") {
      content =
        message.content || message.text || message.message || "No content";
    } else {
      content = "Invalid message";
    }

    const timestamp = (message && message.timestamp) || Date.now();

    messageElement.innerHTML = `
      <div class="flex ${isOwn ? "justify-end" : "justify-start"}">
        <div class="max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
          isOwn ? "bg-blue-600 text-white" : "bg-gray-700 text-white"
        }">
          <div class="text-sm font-medium mb-1">${senderName}</div>
          <div>${content}</div>
          <div class="text-xs opacity-75 mt-1">
            ${new Date(timestamp).toLocaleTimeString()}
          </div>
        </div>
      </div>
    `;

    this.messagesContainer.appendChild(messageElement);
    this.scrollToBottom();
  }

  addSystemMessage(message) {
    if (!this.messagesContainer) return;

    const messageElement = document.createElement("div");
    messageElement.className = "system-message mb-4";

    messageElement.innerHTML = `
      <div class="flex justify-center">
        <div class="bg-gray-600 text-gray-300 px-3 py-1 rounded-full text-sm">
          <i class="fas fa-shield-alt mr-1"></i>
          ${message}
        </div>
      </div>
    `;

    this.messagesContainer.appendChild(messageElement);
    this.scrollToBottom();
  }

  clearMessages() {
    if (this.messagesContainer) {
      this.messagesContainer.innerHTML = "";
    }
  }

  clearMessageInput() {
    if (this.messageInput) {
      this.messageInput.value = "";
    }
  }

  updateChatHeader(targetName) {
    const chatWith = document.getElementById("chatWith");
    const chatStatus = document.getElementById("chatStatus");

    if (chatWith) {
      chatWith.textContent = `Chat with ${targetName}`;
    }

    if (chatStatus) {
      chatStatus.textContent = "End-to-end encrypted • Online";
      chatStatus.className = "text-sm text-green-400";
    }
  }

  scrollToBottom() {
    if (this.messagesContainer) {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
  }
}
