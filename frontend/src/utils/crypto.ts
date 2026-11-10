/**
 * Client-Side Zero-Knowledge Cryptography Module for LastWord.
 *
 * Implements Web Crypto API primitives:
 * - Master password key derivation via PBKDF2 (SHA-256, 100,000 iterations).
 * - AES-GCM 256-bit vault encryption key generation.
 * - Password-derived key wrapping/unwrapping (AES-GCM).
 * - Client-side encryption & decryption of vault notes & secrets.
 *
 * Security Guarantees:
 * - The master password is NEVER transmitted to the server or persisted in storage.
 * - Plaintext encryption keys are stored only in volatile React memory (cleared on logout).
 * - Only the password-wrapped (encrypted) key envelope is persisted client-side.
 */

export interface EncryptedKeyEnvelope {
  encryptedKey: string; // Base64 ciphertext of the 256-bit raw vault key
  salt: string; // Base64 PBKDF2 salt
  iv: string; // Base64 AES-GCM IV used for key wrapping
  version: number;
}

export interface EncryptedDataPayload {
  ciphertext: string; // Base64
  iv: string; // Base64
}

// Helpers for Base64 conversions
export function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Check whether the current browser environment supports the W3C Web Crypto API.
 * Web Crypto (window.crypto.subtle) is restricted to Secure Contexts (HTTPS or localhost).
 */
export function isWebCryptoSupported(): boolean {
  if (typeof window === 'undefined') {
    return Boolean(globalThis.crypto?.subtle);
  }
  return Boolean(window.isSecureContext && window.crypto && window.crypto.subtle);
}

const getCrypto = (): SubtleCrypto => {
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;
  if (!cryptoObj || !cryptoObj.subtle) {
    const isSecure = typeof window !== 'undefined' ? window.isSecureContext : false;
    if (!isSecure) {
      throw new Error(
        'Web Crypto API is disabled by your browser because this site is being accessed over insecure HTTP. ' +
        'Zero-knowledge encryption requires a Secure Context (HTTPS or localhost).'
      );
    }
    throw new Error('Web Crypto API is not available in this browser environment.');
  }
  return cryptoObj.subtle;
};

/**
 * Generate a cryptographically strong 256-bit AES-GCM vault key.
 */
export async function generateVaultKey(): Promise<CryptoKey> {
  const subtle = getCrypto();
  return subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256,
    },
    true, // Extractable so it can be wrapped by the password key
    ['encrypt', 'decrypt']
  );
}

/**
 * Derive a 256-bit AES-GCM wrapping key from a master password using PBKDF2.
 */
async function deriveWrappingKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const subtle = getCrypto();
  const enc = new TextEncoder();
  const passwordKey = await subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 100_000,
      hash: 'SHA-256',
    },
    passwordKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Wrap (encrypt) the raw vault key with a password-derived wrapping key.
 */
export async function wrapVaultKey(
  vaultKey: CryptoKey,
  password: string
): Promise<EncryptedKeyEnvelope> {
  const subtle = getCrypto();
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;

  // 1. Generate unique 16-byte salt and 12-byte IV
  const salt = cryptoObj.getRandomValues(new Uint8Array(16));
  const iv = cryptoObj.getRandomValues(new Uint8Array(12));

  // 2. Derive wrapping key
  const wrappingKey = await deriveWrappingKey(password, salt);

  // 3. Export raw vault key bytes
  const rawVaultKey = await subtle.exportKey('raw', vaultKey);

  // 4. Encrypt raw vault key bytes using wrapping key
  const encryptedKeyBuffer = await subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as BufferSource,
    },
    wrappingKey,
    rawVaultKey
  );

  return {
    encryptedKey: bufferToBase64(encryptedKeyBuffer),
    salt: bufferToBase64(salt),
    iv: bufferToBase64(iv),
    version: 1,
  };
}

/**
 * Unwrap (decrypt) the vault key using the master password.
 * Throws an error if the password is wrong (AES-GCM authentication tag mismatch).
 */
export async function unwrapVaultKey(
  envelope: EncryptedKeyEnvelope,
  password: string
): Promise<CryptoKey> {
  const subtle = getCrypto();

  const salt = base64ToBuffer(envelope.salt);
  const iv = base64ToBuffer(envelope.iv);
  const encryptedKey = base64ToBuffer(envelope.encryptedKey);

  // 1. Derive wrapping key from master password + stored salt
  const wrappingKey = await deriveWrappingKey(password, salt);

  // 2. Decrypt raw vault key bytes (will throw OperationError if password is wrong)
  try {
    const rawVaultKey = await subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv as BufferSource,
      },
      wrappingKey,
      encryptedKey as BufferSource
    );

    // 3. Re-import as an active CryptoKey
    return await subtle.importKey(
      'raw',
      rawVaultKey,
      {
        name: 'AES-GCM',
        length: 256,
      },
      true,
      ['encrypt', 'decrypt']
    );
  } catch {
    throw new Error('Master password decryption failed: Incorrect credentials or corrupt key envelope');
  }
}

/**
 * Store the encrypted key envelope in client storage indexed by user email / ID.
 * Plaintext keys are never written to disk or storage.
 */
export function persistKeyEnvelope(userIdentifier: string, envelope: EncryptedKeyEnvelope): void {
  try {
    localStorage.setItem(`lastword_key_envelope_${userIdentifier.toLowerCase()}`, JSON.stringify(envelope));
  } catch (err) {
    console.error('Failed to persist encrypted key envelope:', err);
  }
}

/**
 * Retrieve the stored encrypted key envelope.
 */
export function loadKeyEnvelope(userIdentifier: string): EncryptedKeyEnvelope | null {
  try {
    const raw = localStorage.getItem(`lastword_key_envelope_${userIdentifier.toLowerCase()}`);
    if (!raw) return null;
    return JSON.parse(raw) as EncryptedKeyEnvelope;
  } catch {
    return null;
  }
}

/**
 * Clear stored encrypted key envelope.
 */
export function clearKeyEnvelope(userIdentifier: string): void {
  try {
    localStorage.removeItem(`lastword_key_envelope_${userIdentifier.toLowerCase()}`);
  } catch {
    // Ignore
  }
}

/**
 * Encrypt arbitrary string payload (such as a vault note) using the in-memory vault key.
 */
export async function encryptVaultData(
  plaintext: string,
  vaultKey: CryptoKey
): Promise<EncryptedDataPayload> {
  const subtle = getCrypto();
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;

  const iv = cryptoObj.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const encoded = enc.encode(plaintext);

  const ciphertext = await subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as BufferSource,
    },
    vaultKey,
    encoded
  );

  return {
    ciphertext: bufferToBase64(ciphertext),
    iv: bufferToBase64(iv),
  };
}

/**
 * Decrypt ciphertext payload using the in-memory vault key.
 */
export async function decryptVaultData(
  payload: EncryptedDataPayload,
  vaultKey: CryptoKey
): Promise<string> {
  const subtle = getCrypto();
  const iv = base64ToBuffer(payload.iv);
  const ciphertext = base64ToBuffer(payload.ciphertext);

  const decrypted = await subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv as BufferSource,
    },
    vaultKey,
    ciphertext as BufferSource
  );

  const dec = new TextDecoder();
  return dec.decode(decrypted);
}

/**
 * Encrypt arbitrary binary ArrayBuffer (such as a file) using AES-256-GCM.
 */
export async function encryptBinaryData(
  data: ArrayBuffer,
  vaultKey: CryptoKey
): Promise<EncryptedDataPayload> {
  const subtle = getCrypto();
  const cryptoObj = typeof window !== 'undefined' ? window.crypto : globalThis.crypto;

  const iv = cryptoObj.getRandomValues(new Uint8Array(12));
  const ciphertext = await subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as BufferSource,
    },
    vaultKey,
    data
  );

  return {
    ciphertext: bufferToBase64(ciphertext),
    iv: bufferToBase64(iv),
  };
}

/**
 * Decrypt ciphertext back into a binary ArrayBuffer.
 */
export async function decryptBinaryData(
  payload: EncryptedDataPayload,
  vaultKey: CryptoKey
): Promise<ArrayBuffer> {
  const subtle = getCrypto();
  const iv = base64ToBuffer(payload.iv);
  const ciphertext = base64ToBuffer(payload.ciphertext);

  return await subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv as BufferSource,
    },
    vaultKey,
    ciphertext as BufferSource
  );
}

