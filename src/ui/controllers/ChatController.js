/**
 * Chat controller managing chat-related UI and interactions
 * Follows Single Responsibility Principle
 */

import { IUIController } from "../../core/interfaces.js";
import { eventBus } from "../../core/events/EventBus.js";
import { stateManager } from "../../core/state/StateManager.js";
import { ChatView } from "../views/ChatView.js";

export class ChatController extends IUIController {
  constructor(encryptionService, storageService, signalingService) {
    super();
    this.encryptionService = encryptionService;
    this.storageService = storageService;
    this.signalingService = signalingService;
    this.view = new ChatView();
    this.currentChatId = null;
  }

  async initialize() {
    this.setupEventHandlers();
    this.setupUIEventHandlers();
  }

  render(data) {
    // Render method for controller interface compatibility
    if (data && data.messages) {
      this.view.clearMessages();
      data.messages.forEach((msg) => {
        this.view.addMessage(msg, msg.senderName, msg.isOwn);
      });
    }
  }

  setupEventHandlers() {
    eventBus.on("message:received", this.handleMessageReceived.bind(this));
    eventBus.on("chat:selected", this.handleChatSelected.bind(this));
    eventBus.on("ui:contact-selected", this.handleContactSelected.bind(this));
  }

  setupUIEventHandlers() {
    // Setup message input handler
    if (this.view.messageInput) {
      this.view.messageInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage(this.view.messageInput.value);
        }
      });
    }
  }

  async handleContactSelected(data) {
    this.currentChatId = data.id;

    // Update chat header
    this.updateChatHeader(data.name);

    // Clear existing messages
    this.view.clearMessages();

    // Load existing messages if any
    const messages = await this.loadMessages(data.id);

    if (messages.length > 0) {
      console.log(
        `Loading ${messages.length} existing messages for chat with ${data.name}`
      );
      messages.forEach((msg) => {
        this.view.addMessage(msg, msg.senderName, msg.isOwn);
      });
    } else {
      // Show welcome message for new chat
      this.view.addSystemMessage(`Started secure chat with ${data.name}`);
    }

    // Focus message input
    if (this.view.messageInput) {
      this.view.messageInput.focus();
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

  async handleMessageReceived(data) {
    // Only show message if it's for the current chat
    if (data.chatId === this.currentChatId && this.view) {
      this.view.addMessage(data.message, data.senderName, false);

      // Mark as read if chat is active
      this.markMessagesAsRead(data.chatId);
    }
  }

  async handleChatSelected(data) {
    this.currentChatId = data.chatId;
    if (this.view) {
      this.view.updateChatHeader(data.targetName);
      const messages = await this.loadMessages(data.chatId);
      this.view.clearMessages();
      messages.forEach((msg) => {
        this.view.addMessage(msg, msg.senderName, msg.isOwn);
      });
    }
  }

  async sendMessage(content) {
    if (!this.currentChatId || !content.trim()) return;

    const message = {
      id: Date.now().toString(),
      content: content.trim(),
      timestamp: Date.now(),
      chatId: this.currentChatId,
      isOwn: true,
    };

    // Add to UI immediately
    if (this.view) {
      this.view.addMessage(message, "You", true);
      this.view.clearMessageInput();
    }

    // Save to storage
    await this.saveMessage(this.currentChatId, message);

    // Send via signaling
    await this.signalingService.sendMessage({
      type: "chat-message",
      targetId: this.currentChatId,
      message: message,
    });
  }

  async loadMessages(chatId) {
    try {
      return (await this.storageService.load(`messages_${chatId}`)) || [];
    } catch (error) {
      console.error("Failed to load messages:", error);
      return [];
    }
  }

  async saveMessage(chatId, message) {
    try {
      const messages = await this.loadMessages(chatId);
      messages.push(message);
      await this.storageService.save(`messages_${chatId}`, messages);
    } catch (error) {
      console.error("Failed to save message:", error);
    }
  }

  markMessagesAsRead(chatId) {
    // Implementation for marking messages as read
    console.log("Marking messages as read for chat:", chatId);
  }

  handleEvent(event) {
    switch (event.type) {
      case "message:send":
        this.sendMessage(event.data.text);
        break;
      case "message:typing":
        this.handleTyping();
        break;
      case "file:send":
        this.handleFileUpload(event.data.file);
        break;
      case "voice:record":
        this.handleVoiceRecord(event.data.action);
        break;
      default:
        console.warn("Unknown event type:", event.type);
    }
  }

  handleTyping() {
    // Emit typing indicator
    if (this.currentChatId) {
      this.signalingService.sendMessage({
        type: "typing",
        targetId: this.currentChatId,
      });
    }
  }

  async handleFileUpload(file) {
    console.log("File upload requested:", file.name);
    // TODO: Implement file upload logic
  }

  handleVoiceRecord(action) {
    console.log("Voice record action:", action);
    // TODO: Implement voice recording logic
  }
}
