/**
 * Validation utilities
 * Input validation and sanitization functions
 */

/**
 * Validate username
 * @param {string} username - Username to validate
 * @returns {object} Validation result
 */
export function validateUsername(username) {
  const errors = [];
  
  if (!username || typeof username !== 'string') {
    errors.push('Username is required');
  } else {
    if (username.length < 2) {
      errors.push('Username must be at least 2 characters long');
    }
    
    if (username.length > 50) {
      errors.push('Username must be less than 50 characters');
    }
    
    if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
      errors.push('Username can only contain letters, numbers, dots, hyphens, and underscores');
    }
    
    if (username.startsWith('.') || username.endsWith('.')) {
      errors.push('Username cannot start or end with a dot');
    }
    
    if (username.includes('..')) {
      errors.push('Username cannot contain consecutive dots');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    sanitized: username ? username.trim() : '',
  };
}

/**
 * Validate message content
 * @param {string} message - Message to validate
 * @returns {object} Validation result
 */
export function validateMessage(message) {
  const errors = [];
  
  if (!message || typeof message !== 'string') {
    errors.push('Message cannot be empty');
  } else {
    const trimmed = message.trim();
    
    if (trimmed.length === 0) {
      errors.push('Message cannot be empty');
    }
    
    if (trimmed.length > 5000) {
      errors.push('Message is too long (maximum 5000 characters)');
    }
    
    // Check for potentially harmful content
    if (containsHarmfulContent(trimmed)) {
      errors.push('Message contains prohibited content');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    sanitized: message ? message.trim() : '',
  };
}

/**
 * Validate file upload
 * @param {File} file - File to validate
 * @param {object} options - Validation options
 * @returns {object} Validation result
 */
export function validateFile(file, options = {}) {
  const errors = [];
  
  const {
    maxSize = 50 * 1024 * 1024, // 50MB default
    allowedTypes = [],
    allowedExtensions = [],
    minSize = 0,
  } = options;
  
  if (!file) {
    errors.push('No file selected');
  } else {
    // Check file size
    if (file.size > maxSize) {
      errors.push(`File size too large (maximum ${formatFileSize(maxSize)})`);
    }
    
    if (file.size < minSize) {
      errors.push(`File size too small (minimum ${formatFileSize(minSize)})`);
    }
    
    // Check file type
    if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
      errors.push(`File type not allowed (${file.type})`);
    }
    
    // Check file extension
    if (allowedExtensions.length > 0) {
      const extension = file.name.split('.').pop().toLowerCase();
      if (!allowedExtensions.includes(extension)) {
        errors.push(`File extension not allowed (.${extension})`);
      }
    }
    
    // Check filename
    if (file.name.length > 255) {
      errors.push('Filename too long (maximum 255 characters)');
    }
    
    if (!/^[a-zA-Z0-9._-]+$/.test(file.name.replace(/\.[^.]+$/, ''))) {
      errors.push('Filename contains invalid characters');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    file,
  };
}

/**
 * Format file size for display
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Check for harmful content in text
 * @param {string} text - Text to check
 * @returns {boolean} Contains harmful content
 */
function containsHarmfulContent(text) {
  // Basic checks for harmful content
  const harmfulPatterns = [
    /<script[^>]*>.*?<\/script>/gi,
    /<iframe[^>]*>.*?<\/iframe>/gi,
    /javascript:/gi,
    /data:text\/html/gi,
    /vbscript:/gi,
    /on\w+\s*=/gi, // onclick, onload, etc.
  ];
  
  return harmfulPatterns.some(pattern => pattern.test(text));
}

/**
 * Validate peer ID
 * @param {string} peerId - Peer ID to validate
 * @returns {object} Validation result
 */
export function validatePeerId(peerId) {
  const errors = [];
  
  if (!peerId || typeof peerId !== 'string') {
    errors.push('Peer ID is required');
  } else {
    if (!/^[a-f0-9-]+$/.test(peerId)) {
      errors.push('Invalid peer ID format');
    }
    
    if (peerId.length !== 36) {
      errors.push('Peer ID must be 36 characters long');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    peerId,
  };
}

/**
 * Validate status
 * @param {string} status - Status to validate
 * @returns {object} Validation result
 */
export function validateStatus(status) {
  const errors = [];
  const allowedStatuses = ['Online', 'Away', 'Do Not Disturb', 'Offline', 'In call'];
  
  if (!status || typeof status !== 'string') {
    errors.push('Status is required');
  } else if (!allowedStatuses.includes(status)) {
    errors.push('Invalid status');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    status,
  };
}

/**
 * Validate WebRTC offer/answer
 * @param {object} sdp - SDP object to validate
 * @returns {object} Validation result
 */
export function validateSDP(sdp) {
  const errors = [];
  
  if (!sdp || typeof sdp !== 'object') {
    errors.push('SDP is required');
  } else {
    if (!sdp.type || !['offer', 'answer'].includes(sdp.type)) {
      errors.push('Invalid SDP type');
    }
    
    if (!sdp.sdp || typeof sdp.sdp !== 'string') {
      errors.push('SDP description is required');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    sdp,
  };
}

/**
 * Validate ICE candidate
 * @param {object} candidate - ICE candidate to validate
 * @returns {object} Validation result
 */
export function validateIceCandidate(candidate) {
  const errors = [];
  
  if (!candidate || typeof candidate !== 'object') {
    errors.push('ICE candidate is required');
  } else {
    if (!candidate.candidate || typeof candidate.candidate !== 'string') {
      errors.push('ICE candidate string is required');
    }
    
    if (candidate.sdpMLineIndex !== null && typeof candidate.sdpMLineIndex !== 'number') {
      errors.push('Invalid SDP M-line index');
    }
    
    if (candidate.sdpMid !== null && typeof candidate.sdpMid !== 'string') {
      errors.push('Invalid SDP MID');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    candidate,
  };
}

/**
 * Validate public key
 * @param {object} publicKey - Public key to validate
 * @returns {object} Validation result
 */
export function validatePublicKey(publicKey) {
  const errors = [];
  
  if (!publicKey || typeof publicKey !== 'object') {
    errors.push('Public key is required');
  } else {
    if (!publicKey.kty || publicKey.kty !== 'EC') {
      errors.push('Invalid key type');
    }
    
    if (!publicKey.crv || publicKey.crv !== 'P-256') {
      errors.push('Invalid curve');
    }
    
    if (!publicKey.x || typeof publicKey.x !== 'string') {
      errors.push('Invalid X coordinate');
    }
    
    if (!publicKey.y || typeof publicKey.y !== 'string') {
      errors.push('Invalid Y coordinate');
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    publicKey,
  };
}

/**
 * Sanitize input text
 * @param {string} text - Text to sanitize
 * @returns {string} Sanitized text
 */
export function sanitizeText(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  return text
    .trim()
    .replace(/\0/g, '') // Remove null bytes
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .replace(/\s+/g, ' '); // Normalize whitespace
}

/**
 * Sanitize filename
 * @param {string} filename - Filename to sanitize
 * @returns {string} Sanitized filename
 */
export function sanitizeFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    return 'untitled';
  }
  
  return filename
    .trim()
    .replace(/[<>:"/\\|?*\0]/g, '_') // Replace invalid characters
    .replace(/^\.+/, '_') // Don't start with dots
    .replace(/\.+$/, '_') // Don't end with dots
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .substring(0, 255); // Limit length
}

/**
 * Validate and sanitize input
 * @param {any} input - Input to validate
 * @param {string} type - Type of validation
 * @param {object} options - Validation options
 * @returns {object} Validation result
 */
export function validateAndSanitize(input, type, options = {}) {
  switch (type) {
    case 'username':
      return validateUsername(input);
    case 'message':
      return validateMessage(input);
    case 'file':
      return validateFile(input, options);
    case 'peerId':
      return validatePeerId(input);
    case 'status':
      return validateStatus(input);
    case 'sdp':
      return validateSDP(input);
    case 'iceCandidate':
      return validateIceCandidate(input);
    case 'publicKey':
      return validatePublicKey(input);
    default:
      return {
        isValid: false,
        errors: ['Unknown validation type'],
        sanitized: input,
      };
  }
}