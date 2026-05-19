/**
 * Encryption service implementing E2E encryption
 * Follows Single Responsibility Principle
 */

import { IEncryptionService } from "../../core/interfaces.js";
import { appConfig } from "../../core/config/AppConfig.js";

export class EncryptionService extends IEncryptionService {
  constructor() {
    super();
    this.keyPairs = new Map();
    this.sharedSecrets = new Map();
  }

  async initialize() {
    if (!window.crypto || !window.crypto.subtle) {
      throw new Error("Web Crypto API is not available");
    }
    await this.generateKeys();
  }

  async generateKeys() {
    const config = appConfig.get("encryption");
    const keyPair = await window.crypto.subtle.generateKey(
      {
        name: config.algorithm,
        namedCurve: config.namedCurve,
      },
      true,
      config.keyUsages
    );

    this.keyPairs.set("local", keyPair);
    return keyPair;
  }

  async encryptMessage(data, targetId) {
    // Basic implementation - will be enhanced
    return new TextEncoder().encode(data);
  }

  async decryptMessage(data, senderId) {
    // Basic implementation - will be enhanced
    return new TextDecoder().decode(data);
  }

  async destroy() {
    this.keyPairs.clear();
    this.sharedSecrets.clear();
  }
}
