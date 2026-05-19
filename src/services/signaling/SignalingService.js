import { ICommunicationService } from "../../core/interfaces.js";
import { eventBus } from "../../core/events/EventBus.js";
import { appConfig } from "../../core/config/AppConfig.js";

export class SignalingService extends ICommunicationService {
  constructor() {
    super();
    this.ws = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.clientId = null;
    this.userName = null;
  }

  async initialize() {
    const config = appConfig.get("websocket");
    const url = `${config.protocol}//${config.host}`;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          eventBus.emit("signaling:connected");
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(JSON.parse(event.data));
        };

        this.ws.onclose = () => {
          this.isConnected = false;
          eventBus.emit("signaling:disconnected");
          this.attemptReconnect();
        };

        this.ws.onerror = (error) => {
          reject(error);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  register(userName) {
    this.userName = userName;
    this.sendMessage({
      type: "register",
      name: userName,
    });
  }

  updateStatus(status) {
    this.sendMessage({
      type: "status-update",
      status: status,
    });
  }

  async sendMessage(message) {
    if (this.isConnected && this.ws) {
      this.ws.send(JSON.stringify(message));
    }
  }

  handleMessage(message) {
    switch (message.type) {
      case "init":
        this.clientId = message.id;
        eventBus.emit("signaling:init", message);
        break;
      case "peer-list":
        eventBus.emit("signaling:peer-list", message);
        break;
      case "chat-message":
        this.handleChatMessage(message);
        break;
      case "typing":
        this.handleTypingIndicator(message);
        break;
      case "offer":
      case "answer":
      case "ice-candidate":
        eventBus.emit(`signaling:${message.type}`, message);
        break;
      default:
        eventBus.emit(`signaling:${message.type}`, message);
    }
  }

  handleChatMessage(message) {
    // Emit message received event for the chat controller
    eventBus.emit("message:received", {
      chatId: message.from,
      senderName: message.fromName,
      message: message.message,
      timestamp: message.timestamp,
    });
  }

  handleTypingIndicator(message) {
    // Emit typing indicator event
    eventBus.emit("typing:received", {
      chatId: message.from,
      senderName: message.fromName,
      timestamp: message.timestamp,
    });
  }

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => this.initialize(), 3000);
    } else {
      eventBus.emit("signaling:reconnect-failed");
    }
  }

  async destroy() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }
}
