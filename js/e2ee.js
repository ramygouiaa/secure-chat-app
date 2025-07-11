// js/e2ee.js

// Note: sharedSecrets is a global variable for now,
// but will be managed by a StateManager or DataManager module later.
// It's accessed here directly for the initial refactor step.

export async function generateKeys() {
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

export async function encryptMessage(data, targetId) {
  const secret = sharedSecrets[targetId];
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  let dataToEncrypt = typeof data === "string" ? new TextEncoder().encode(data) : data;

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

export async function decryptMessage(data, senderId) {
  const secret = sharedSecrets[senderId];
  const buffer = new Uint8Array(data);
  const iv = buffer.slice(0, 12);
  const ciphertext = buffer.slice(12);
  return await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, secret, ciphertext);
}
