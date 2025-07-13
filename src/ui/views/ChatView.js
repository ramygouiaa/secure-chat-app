import { View } from "./View.js";
import { formatTime, escapeHtml, formatDuration } from "../../utils/helpers.js";

export class ChatView extends View {
  constructor() {
    super("#messagesContainer");
    this.chatWith = document.getElementById("chatWith");
    this.typingIndicator = document.getElementById("typingIndicator");
  }

  render(discussion) {
    const allItems = [
      ...(discussion.messages || []).map((item) => ({
        ...item,
        itemType: "message",
      })),
      ...(discussion.calls || []).map((item) => ({
        ...item,
        itemType: "call",
      })),
    ];

    allItems.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const itemsHtml = allItems.map((item) => this.renderItem(item)).join("");

    this.element.innerHTML = itemsHtml;
    this.element.scrollTop = this.element.scrollHeight;
  }

  renderItem(item) {
    if (item.itemType === "message") {
      return this.renderMessage(item);
    } else if (item.itemType === "call") {
      return this.renderCallRecord(item);
    }
    return "";
  }

  renderMessage(message) {
    const time = formatTime(message.timestamp);
    const isOwn = message.sender === "You";

    const statusIcon = isOwn ? this.getStatusIcon(message.status) : "";

    let content = "";
    if (message.text) {
      content = `<span class="text-sm">${escapeHtml(message.text)}</span>`;
    } else if (message.audioUrl) {
      content = `<audio controls src="${message.audioUrl}"></audio>`;
    } else if (message.file) {
      content = `<a href="${message.file.url}" download="${
        message.file.name
      }" class="text-blue-300 hover:underline">${escapeHtml(
        message.file.name
      )}</a>`;
    }

    return `
      <div class="flex ${isOwn ? "justify-end" : "justify-start"}">
        <div class="bg-${
          isOwn ? "green" : "gray"
        }-700 px-4 py-2 rounded-lg max-w-xs">
          ${content}
          <div class="text-xs text-gray-400 text-right mt-1">
            ${time}
            ${statusIcon}
          </div>
        </div>
      </div>
    `;
  }

  renderCallRecord(call) {
    const time = formatTime(call.timestamp);
    const duration =
      call.status === "ended" ? `(${formatDuration(call.duration)})` : "";

    return `
      <div class="text-center text-gray-500 text-xs my-2">
        ${call.type === "video" ? "Video" : "Voice"} Call ${
      call.status
    } ${duration} - ${time}
      </div>
    `;
  }

  getStatusIcon(status) {
    switch (status) {
      case "read":
        return '<i class="fas fa-check-double text-blue-400"></i>';
      case "delivered":
        return '<i class="fas fa-check-double"></i>';
      case "sent":
        return '<i class="fas fa-check"></i>';
      default:
        return "";
    }
  }

  updateChatHeader(targetName) {
    this.chatWith.textContent = `Chatting with: ${targetName}`;
  }

  showTypingIndicator() {
    this.typingIndicator.classList.remove("hidden");
  }

  hideTypingIndicator() {
    this.typingIndicator.classList.add("hidden");
  }
}
