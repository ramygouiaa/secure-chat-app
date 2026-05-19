export class IService {
  async initialize() {
    throw new Error("Method initialize must be implemented");
  }

  async destroy() {
    // Optional method - default empty implementation
  }
}

export class ICommunicationService extends IService {
  async sendMessage(message) {
    throw new Error("Method sendMessage must be implemented");
  }
}

export class IEncryptionService extends IService {
  async generateKeys() {
    throw new Error("Method generateKeys must be implemented");
  }

  async encryptMessage(data, targetId) {
    throw new Error("Method encryptMessage must be implemented");
  }

  async decryptMessage(data, senderId) {
    throw new Error("Method decryptMessage must be implemented");
  }
}

export class IStorageService extends IService {
  async save(key, data) {
    throw new Error("Method save must be implemented");
  }

  async load(key) {
    throw new Error("Method load must be implemented");
  }

  async remove(key) {
    throw new Error("Method remove must be implemented");
  }
}

export class IUIController {
  async initialize() {
    throw new Error("Method initialize must be implemented");
  }
}

export class IStateManager {
  dispatch(action, payload) {
    throw new Error("Method dispatch must be implemented");
  }

  subscribe(callback) {
    throw new Error("Method subscribe must be implemented");
  }

  getState() {
    throw new Error("Method getState must be implemented");
  }
}

export class IEventBus {
  emit(event, data) {
    throw new Error("Method emit must be implemented");
  }

  on(event, callback) {
    throw new Error("Method on must be implemented");
  }

  off(event, callback) {
    throw new Error("Method off must be implemented");
  }
}
