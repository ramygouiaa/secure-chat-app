/**
 * Centralized configuration management
 * Single source of truth for all app configuration
 */

export class AppConfig {
  constructor() {
    this.config = {
      // WebRTC Configuration
      webrtc: {
        iceServers: [
          {
            urls: "stun:stun.relay.metered.ca:80",
          },
          {
            urls: "turn:global.relay.metered.ca:80",
            username: "64a842e9e0257e8c336c930b",
            credential: "kC6B4K9z5X/Eo/kf",
          },
          {
            urls: "turn:global.relay.metered.ca:80?transport=tcp",
            username: "64a842e9e0257e8c336c930b",
            credential: "kC6B4K9z5X/Eo/kf",
          },
          {
            urls: "turn:global.relay.metered.ca:443",
            username: "64a842e9e0257e8c336c930b",
            credential: "kC6B4K9z5X/Eo/kf",
          },
          {
            urls: "turns:global.relay.metered.ca:443?transport=tcp",
            username: "64a842e9e0257e8c336c930b",
            credential: "kC6B4K9z5X/Eo/kf",
          },
        ],
        connectionTimeout: 15000,
        chunkSize: 16384,
      },
      
      // WebSocket Configuration
      websocket: {
        protocol: window.location.protocol === "https:" ? "wss:" : "ws:",
        host: window.location.host,
        reconnectDelay: 3000,
        heartbeatInterval: 30000,
      },
      
      // Encryption Configuration
      encryption: {
        algorithm: "ECDH",
        namedCurve: "P-256",
        keyUsages: ["deriveKey"],
        derivedKeyAlgorithm: "AES-GCM",
        keyLength: 256,
        ivLength: 12,
      },
      
      // UI Configuration
      ui: {
        notificationTimeout: 5000,
        typingTimeout: 1000,
        callRingDuration: 5,
        statusColors: {
          Online: "bg-green-500",
          Away: "bg-yellow-500",
          "In call": "bg-red-500",
          "Do Not Disturb": "bg-orange-500",
          Offline: "bg-gray-500",
        },
      },
      
      // Media Configuration
      media: {
        audio: {
          sampleRate: 48000,
          channelCount: 2,
        },
        video: {
          width: { min: 640, ideal: 1280, max: 1920 },
          height: { min: 480, ideal: 720, max: 1080 },
          frameRate: { min: 15, ideal: 30, max: 60 },
        },
      },
      
      // Storage Configuration
      storage: {
        prefix: "securechat_",
        discussionKey: "discussion_",
        userKey: "user_",
      },
      
      // Development Configuration
      development: {
        enableDebugLogs: true,
        enablePerformanceMetrics: true,
      },
    };
  }
  
  get(path) {
    return this.getNestedValue(this.config, path);
  }
  
  set(path, value) {
    this.setNestedValue(this.config, path, value);
  }
  
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => 
      current && current[key] !== undefined ? current[key] : undefined, obj
    );
  }
  
  setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((current, key) => {
      if (!current[key]) current[key] = {};
      return current[key];
    }, obj);
    target[lastKey] = value;
  }
  
  // Environment-specific configurations
  isDevelopment() {
    return process.env.NODE_ENV === 'development';
  }
  
  isProduction() {
    return process.env.NODE_ENV === 'production';
  }
}

// Singleton instance
export const appConfig = new AppConfig();