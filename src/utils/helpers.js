/**
 * Utility helper functions
 * Pure functions following functional programming principles
 */

/**
 * Generate a unique ID
 * @returns {string} Unique identifier
 */
export function generateId() {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a UUID v4
 * @returns {string} UUID
 */
export function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c == "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function validateMessage(content) {
  if (!content || typeof content !== "string") {
    return { isValid: false, error: "Message content is required" };
  }

  if (content.trim().length === 0) {
    return { isValid: false, error: "Message cannot be empty" };
  }

  if (content.length > 1000) {
    return { isValid: false, error: "Message too long" };
  }

  return {
    isValid: true,
    sanitized: content
      .trim()
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ""),
  };
}

export function formatTimestamp(timestamp) {
  return new Date(timestamp).toLocaleTimeString();
}

/**
 * Debounce function execution
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function execution
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in milliseconds
 * @returns {Function} Throttled function
 */
export function throttle(func, limit) {
  let inThrottle;
  return function (...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Deep clone an object
 * @param {any} obj - Object to clone
 * @returns {any} Cloned object
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }

  if (obj instanceof Array) {
    return obj.map((item) => deepClone(item));
  }

  if (typeof obj === "object") {
    const cloned = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = deepClone(obj[key]);
      }
    }
    return cloned;
  }

  return obj;
}

/**
 * Format timestamp to readable time
 * @param {number|string|Date} timestamp - Timestamp to format
 * @returns {string} Formatted time
 */
export function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Format timestamp to readable date
 * @param {number|string|Date} timestamp - Timestamp to format
 * @returns {string} Formatted date
 */
export function formatDate(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleDateString();
}

/**
 * Format timestamp to relative time (e.g., "2 minutes ago")
 * @param {number|string|Date} timestamp - Timestamp to format
 * @returns {string} Relative time
 */
export function formatRelativeTime(timestamp) {
  const now = new Date();
  const date = new Date(timestamp);
  const diff = now.getTime() - date.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days} day${days > 1 ? "s" : ""} ago`;
  } else if (hours > 0) {
    return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  } else if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  } else {
    return "Just now";
  }
}

/**
 * Format call duration
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration
 */
export function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds
      .toString()
      .padStart(2, "0")}`;
  } else {
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  }
}

/**
 * Format file size
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} Is valid email
 */
export function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate URL format
 * @param {string} url - URL to validate
 * @returns {boolean} Is valid URL
 */
export function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitize HTML string
 * @param {string} html - HTML string to sanitize
 * @returns {string} Sanitized HTML
 */
export function sanitizeHtml(html) {
  const div = document.createElement("div");
  div.textContent = html;
  return div.innerHTML;
}

/**
 * Escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
export function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Get file extension from filename
 * @param {string} filename - Filename
 * @returns {string} File extension
 */
export function getFileExtension(filename) {
  return filename.split(".").pop().toLowerCase();
}

/**
 * Get file type from filename
 * @param {string} filename - Filename
 * @returns {string} File type category
 */
export function getFileType(filename) {
  const extension = getFileExtension(filename);

  const imageTypes = ["jpg", "jpeg", "png", "gif", "svg", "webp"];
  const videoTypes = ["mp4", "avi", "mov", "wmv", "flv", "webm"];
  const audioTypes = ["mp3", "wav", "ogg", "flac", "aac"];
  const documentTypes = ["pdf", "doc", "docx", "txt", "rtf"];

  if (imageTypes.includes(extension)) return "image";
  if (videoTypes.includes(extension)) return "video";
  if (audioTypes.includes(extension)) return "audio";
  if (documentTypes.includes(extension)) return "document";

  return "other";
}

/**
 * Convert array buffer to base64
 * @param {ArrayBuffer} buffer - Array buffer
 * @returns {string} Base64 string
 */
export function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert base64 to array buffer
 * @param {string} base64 - Base64 string
 * @returns {Uint8Array} Array buffer
 */
export function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Check if device supports WebRTC
 * @returns {boolean} WebRTC support
 */
export function supportsWebRTC() {
  return !!(
    window.RTCPeerConnection ||
    window.webkitRTCPeerConnection ||
    window.mozRTCPeerConnection
  );
}

/**
 * Check if device supports getUserMedia
 * @returns {boolean} getUserMedia support
 */
export function supportsGetUserMedia() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

/**
 * Get device capabilities
 * @returns {object} Device capabilities
 */
export function getDeviceCapabilities() {
  return {
    webrtc: supportsWebRTC(),
    getUserMedia: supportsGetUserMedia(),
    webSocket: !!window.WebSocket,
    webCrypto: !!window.crypto.subtle,
    sessionStorage: !!window.sessionStorage,
    localStorage: !!window.localStorage,
  };
}

/**
 * Check if running on mobile device
 * @returns {boolean} Is mobile device
 */
export function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

/**
 * Get browser information
 * @returns {object} Browser info
 */
export function getBrowserInfo() {
  const ua = navigator.userAgent;
  let browser = "Unknown";

  if (ua.includes("Chrome")) browser = "Chrome";
  else if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Safari")) browser = "Safari";
  else if (ua.includes("Edge")) browser = "Edge";
  else if (ua.includes("Opera")) browser = "Opera";

  return {
    name: browser,
    userAgent: ua,
    platform: navigator.platform,
    language: navigator.language,
    cookieEnabled: navigator.cookieEnabled,
  };
}

/**
 * Generate random color
 * @returns {string} Random hex color
 */
export function generateRandomColor() {
  return "#" + Math.floor(Math.random() * 16777215).toString(16);
}

/**
 * Get contrasting color (black or white)
 * @param {string} hexColor - Hex color code
 * @returns {string} Contrasting color
 */
export function getContrastingColor(hexColor) {
  const r = parseInt(hexColor.substr(1, 2), 16);
  const g = parseInt(hexColor.substr(3, 2), 16);
  const b = parseInt(hexColor.substr(5, 2), 16);

  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 128 ? "#000000" : "#ffffff";
}

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} Success status
 */
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const success = document.execCommand("copy");
      textArea.remove();
      return success;
    }
  } catch (error) {
    console.error("Failed to copy text:", error);
    return false;
  }
}

/**
 * Download file as blob
 * @param {Blob} blob - File blob
 * @param {string} filename - Filename
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Play audio with loop
 * @param {HTMLAudioElement} audioElement - Audio element
 * @param {number} loopCount - Number of loops
 */
export function playAudioWithLoop(audioElement, loopCount = 1) {
  let playedCount = 0;

  const playHandler = () => {
    playedCount++;
    if (playedCount < loopCount) {
      audioElement.currentTime = 0;
      audioElement.play();
    } else {
      audioElement.removeEventListener("ended", playHandler);
    }
  };

  audioElement.addEventListener("ended", playHandler);
  audioElement.currentTime = 0;
  audioElement.play().catch((error) => {
    console.error("Audio play failed:", error);
  });
}

/**
 * Stop audio playback
 * @param {HTMLAudioElement} audioElement - Audio element
 */
export function stopAudio(audioElement) {
  audioElement.pause();
  audioElement.currentTime = 0;
}
