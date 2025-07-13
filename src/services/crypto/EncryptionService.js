/**
 * Encryption service implementing E2E encryption
 * Follows Single Responsibility Principle
 */

import { IEncryptionService } from '../../core/interfaces.js';
import { appConfig } from '../../core/config/AppConfig.js';
import { errorHandler } from '../../core/errors/ErrorHandler.js';

export class EncryptionService extends IEncryptionService {
  constructor() {
    super();
    this.keys = null;
    this.sharedSecrets = new Map();
    this.config = appConfig.get('encryption');
  }
  
  async initialize() {
    try {
      this.keys = await this.generateKeys();
      console.log('Encryption service initialized with new keys');
    } catch (error) {
      errorHandler.createEncryptionError('Failed to initialize encryption service', { error });
      throw error;
    }
  }
  
  async destroy() {
    this.keys = null;
    this.sharedSecrets.clear();
  }
  
  async generateKeys() {
    try {
      return await window.crypto.subtle.generateKey(
        { 
          name: this.config.algorithm, 
          namedCurve: this.config.namedCurve 
        },
        true,
        this.config.keyUsages
      );
    } catch (error) {
      errorHandler.createEncryptionError('Failed to generate encryption keys', { error });
      throw error;
    }
  }
  
  async exportPublicKey(key = null) {
    try {
      const keyToExport = key || this.keys.publicKey;
      return await window.crypto.subtle.exportKey("jwk", keyToExport);
    } catch (error) {
      errorHandler.createEncryptionError('Failed to export public key', { error });
      throw error;
    }
  }
  
  async importPublicKey(jwk) {
    try {
      return await window.crypto.subtle.importKey(
        "jwk",
        jwk,
        { 
          name: this.config.algorithm, 
          namedCurve: this.config.namedCurve 
        },
        true,
        []
      );
    } catch (error) {
      errorHandler.createEncryptionError('Failed to import public key', { error });
      throw error;
    }
  }
  
  async deriveSharedSecret(privateKey, publicKey) {
    try {
      return await window.crypto.subtle.deriveKey(
        { name: this.config.algorithm, public: publicKey },
        privateKey,
        { 
          name: this.config.derivedKeyAlgorithm, 
          length: this.config.keyLength 
        },
        true,
        ["encrypt", "decrypt"]
      );
    } catch (error) {
      errorHandler.createEncryptionError('Failed to derive shared secret', { error });
      throw error;
    }
  }
  
  async establishSharedSecret(targetId, remotePublicKeyJwk) {
    try {
      const remotePublicKey = await this.importPublicKey(remotePublicKeyJwk);
      const sharedSecret = await this.deriveSharedSecret(
        this.keys.privateKey,
        remotePublicKey
      );
      
      this.sharedSecrets.set(targetId, sharedSecret);
      console.log(`Shared secret established with ${targetId}`);
      return sharedSecret;
    } catch (error) {
      errorHandler.createEncryptionError('Failed to establish shared secret', { error, targetId });
      throw error;
    }
  }
  
  async encryptMessage(data, targetId) {
    try {
      const secret = this.sharedSecrets.get(targetId);
      if (!secret) {
        throw new Error(`No shared secret found for target ${targetId}`);
      }
      
      const iv = window.crypto.getRandomValues(new Uint8Array(this.config.ivLength));
      
      let dataToEncrypt;
      if (typeof data === "string") {
        dataToEncrypt = new TextEncoder().encode(data);
      } else {
        dataToEncrypt = data;
      }
      
      const ciphertext = await window.crypto.subtle.encrypt(
        { name: this.config.derivedKeyAlgorithm, iv: iv },
        secret,
        dataToEncrypt
      );
      
      // Combine IV and ciphertext
      const buffer = new Uint8Array(iv.length + ciphertext.byteLength);
      buffer.set(iv, 0);
      buffer.set(new Uint8Array(ciphertext), iv.length);
      
      return buffer;
    } catch (error) {
      errorHandler.createEncryptionError('Failed to encrypt message', { error, targetId });
      throw error;
    }
  }
  
  async decryptMessage(data, senderId) {
    try {
      const secret = this.sharedSecrets.get(senderId);
      if (!secret) {
        throw new Error(`No shared secret found for sender ${senderId}`);
      }
      
      const buffer = new Uint8Array(data);
      const iv = buffer.slice(0, this.config.ivLength);
      const ciphertext = buffer.slice(this.config.ivLength);
      
      const decrypted = await window.crypto.subtle.decrypt(
        { name: this.config.derivedKeyAlgorithm, iv: iv },
        secret,
        ciphertext
      );
      
      return decrypted;
    } catch (error) {
      errorHandler.createEncryptionError('Failed to decrypt message', { error, senderId });
      throw error;
    }
  }
  
  getPublicKey() {
    return this.keys ? this.keys.publicKey : null;
  }
  
  hasSharedSecret(targetId) {
    return this.sharedSecrets.has(targetId);
  }
  
  removeSharedSecret(targetId) {
    return this.sharedSecrets.delete(targetId);
  }
  
  clearAllSharedSecrets() {
    this.sharedSecrets.clear();
  }
}