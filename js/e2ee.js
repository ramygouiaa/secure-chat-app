// js/e2ee.js

// js/e2ee.js

// These functions will now receive the StateManager instance to access sharedSecrets and myKeys.

export async function generateKeys() {
  // This function doesn't directly need state, but it's good practice to have it available if needed.
  // For now, it's called by app.js which will manage the state.
  return await window.crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"]
  );
}

export async function exportPublicKey(key) {
  const exported = await window.crypto.subtle.exportKey("jwk", key);
  return exported;
}

export async function importPublicKey(jwk) {
  return await window.crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    []
  );
}

export async function deriveSharedSecret(privateKey, publicKey) {
  return await window.crypto.subtle.deriveKey(
    { name: "ECDH", public: publicKey },
    privateKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

// These functions now accept the StateManager instance to access secrets.
export async function encryptMessage(data, targetId, stateManager) {
  const secret = stateManager.getSharedSecret(targetId);
  if (!secret) {
    throw new Error(`Shared secret not found for targetId: ${targetId}`);
  }
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  let dataToEncrypt =
    typeof data === "string" ? new TextEncoder().encode(data) : data;

  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    secret,
    dataToEncrypt
  );

  const buffer = new Uint8Array(iv.length + ciphertext.byteLength);
  buffer.set(iv, 0);
  buffer.set(new Uint8Array(ciphertext), iv.length);
  return buffer;
}

export async function decryptMessage(data, senderId, stateManager) {
  const secret = stateManager.getSharedSecret(senderId);
  if (!secret) {
    throw new Error(`Shared secret not found for senderId: ${senderId}`);
  }
  const buffer = new Uint8Array(data);
  const iv = buffer.slice(0, 12);
  const ciphertext = buffer.slice(12);
  return await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv },
    secret,
    ciphertext
  );
}
