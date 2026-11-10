import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateVaultKey,
  wrapVaultKey,
  unwrapVaultKey,
  encryptVaultData,
  decryptVaultData,
  persistKeyEnvelope,
  loadKeyEnvelope,
  clearKeyEnvelope,
} from '../utils/crypto';

describe('Zero-Knowledge Client-Side Cryptography', () => {
  const testPassword = 'CorrectMasterPassword123!';
  const wrongPassword = 'IncorrectPassword999!';

  beforeEach(() => {
    localStorage.clear();
  });

  it('generates a valid 256-bit AES-GCM vault key', async () => {
    const key = await generateVaultKey();
    expect(key).toBeDefined();
    expect(key.algorithm.name).toBe('AES-GCM');
    expect((key.algorithm as AesKeyGenParams).length).toBe(256);
    expect(key.type).toBe('secret');
  });

  it('wraps the vault key and unwraps it with the correct master password', async () => {
    const originalKey = await generateVaultKey();

    // 1. Wrap key using master password
    const envelope = await wrapVaultKey(originalKey, testPassword);
    expect(envelope.encryptedKey).toBeTypeOf('string');
    expect(envelope.salt).toBeTypeOf('string');
    expect(envelope.iv).toBeTypeOf('string');

    // 2. Unwrap key using the SAME master password
    const recoveredKey = await unwrapVaultKey(envelope, testPassword);
    expect(recoveredKey).toBeDefined();
    expect(recoveredKey.algorithm.name).toBe('AES-GCM');

    // 3. Verify recovered key can decrypt data encrypted by original key
    const secretMessage = 'Top secret personal directives for trusted contacts.';
    const encryptedPayload = await encryptVaultData(secretMessage, originalKey);
    const decryptedMessage = await decryptVaultData(encryptedPayload, recoveredKey);

    expect(decryptedMessage).toBe(secretMessage);
  });

  it('fails to unwrap the vault key when given an incorrect master password', async () => {
    const originalKey = await generateVaultKey();
    const envelope = await wrapVaultKey(originalKey, testPassword);

    // Attempt to unwrap with wrong password must throw error (AES-GCM tag mismatch)
    await expect(unwrapVaultKey(envelope, wrongPassword)).rejects.toThrow(
      /Master password decryption failed/
    );
  });

  it('persists and retrieves encrypted key envelopes from local storage without exposing plaintext', async () => {
    const originalKey = await generateVaultKey();
    const envelope = await wrapVaultKey(originalKey, testPassword);
    const userEmail = 'elena@example.com';

    persistKeyEnvelope(userEmail, envelope);
    const loaded = loadKeyEnvelope(userEmail);

    expect(loaded).toEqual(envelope);
    expect(localStorage.getItem(`lastword_key_envelope_${userEmail}`)).not.toContain(testPassword);

    clearKeyEnvelope(userEmail);
    expect(loadKeyEnvelope(userEmail)).toBeNull();
  });
});

