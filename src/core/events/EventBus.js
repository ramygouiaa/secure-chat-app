import { IEventBus } from "../interfaces.js";

class EventBus extends IEventBus {
  constructor() {
    super();
    this.events = {};
  }

  on(event, listener) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(listener);
    return () => this.off(event, listener);
  }

  off(event, listener) {
    if (!this.events[event]) {
      return;
    }
    this.events[event] = this.events[event].filter((l) => l !== listener);
  }

  emit(event, data) {
    if (!this.events[event]) {
      return;
    }
    this.events[event].forEach((listener) => listener(data));
  }
}

export const eventBus = new EventBus();
