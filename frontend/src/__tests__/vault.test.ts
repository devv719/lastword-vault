import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateVaultKey,
  wrapVaultKey,
  unwrapVaultKey,
  encryptVaultData,
  decryptVaultData,
  encryptBinaryData,
  decryptBinaryData,
  persistKeyEnvelope,
  loadKeyEnvelope,
} from '../utils/crypto';
import { vaultService } from '../services/vaultService';

describe('Vault Management & Cryptographic Enclave', () => {
  const masterPassword = 'MySecureMasterPassword2026!';

  beforeEach(() => {
    localStorage.clear();
  });

  it('initializes a vault key envelope and recovers it with master password', async () => {
    const rawVaultKey = await generateVaultKey();
    const envelope = await wrapVaultKey(rawVaultKey, masterPassword);

    expect(envelope.encryptedKey).toBeDefined();
    expect(envelope.salt).toBeDefined();
    expect(envelope.iv).toBeDefined();

    // Persist envelope locally
    persistKeyEnvelope('user-123', envelope);
    const loaded = loadKeyEnvelope('user-123');
    expect(loaded).toEqual(envelope);

    // Unwrap on another session
    const recoveredKey = await unwrapVaultKey(loaded!, masterPassword);
    expect(recoveredKey).toBeDefined();

    // Wrong password must fail
    await expect(unwrapVaultKey(loaded!, 'WrongPassword123')).rejects.toThrow();
  });

  it('encrypts notes on the client before saving and decrypts correctly', async () => {
    const vaultKey = await generateVaultKey();
    const noteTitle = 'Offshore Account Recovery Seed';
    const noteSecret = 'witch collapse practice feed shame open despair creek road again ice leap';

    // 1. Client-side encryption of title and content
    const encryptedTitle = await encryptVaultData(noteTitle, vaultKey);
    const encryptedSecret = await encryptVaultData(noteSecret, vaultKey);

    expect(encryptedTitle.ciphertext).not.toBe(noteTitle);
    expect(encryptedSecret.ciphertext).not.toBe(noteSecret);

    // 2. Decrypt using active vault key
    const decryptedTitle = await decryptVaultData(encryptedTitle, vaultKey);
    const decryptedSecret = await decryptVaultData(encryptedSecret, vaultKey);

    expect(decryptedTitle).toBe(noteTitle);
    expect(decryptedSecret).toBe(noteSecret);
  });

  it('encrypts documents as binary ArrayBuffer and restores original bytes', async () => {
    const vaultKey = await generateVaultKey();
    const originalText = 'CONFIDENTIAL LAST WILL AND TESTAMENT: All assets to trusted contact.';
    const encoder = new TextEncoder();
    const originalBytes = encoder.encode(originalText);

    // 1. Encrypt binary buffer
    const encryptedFile = await encryptBinaryData(originalBytes.buffer, vaultKey);
    expect(encryptedFile.ciphertext).toBeTypeOf('string');
    expect(encryptedFile.iv).toBeTypeOf('string');

    // 2. Decrypt binary buffer
    const decryptedBuffer = await decryptBinaryData(encryptedFile, vaultKey);
    const decoder = new TextDecoder();
    const decryptedText = decoder.decode(decryptedBuffer);

    expect(decryptedText).toBe(originalText);
  });

  it('creates, retrieves, and deletes items via vaultService', async () => {
    const newItem = await vaultService.createItem({
      title: 'Test Will Item',
      type: 'note',
      category: 'Legal',
      releaseAuthorized: true,
      recipientId: null,
      recipientName: null,
      verificationStatus: 'unassigned',
      noteContent: 'Encrypted note test',
    });

    expect(newItem.id).toBeDefined();
    expect(newItem.title).toBe('Test Will Item');

    const allItems = await vaultService.getItems();
    expect(allItems.some((i) => i.id === newItem.id)).toBe(true);

    // Delete item
    await vaultService.deleteItem(newItem.id);
    const itemsAfterDelete = await vaultService.getItems();
    expect(itemsAfterDelete.some((i) => i.id === newItem.id)).toBe(false);
  });

  it('purges keys on vault lock and rejects decryption without key', async () => {
    let activeKey: CryptoKey | null = await generateVaultKey();
    const payload = await encryptVaultData('Secret message', activeKey);

    // Simulate locking vault: purge key from memory
    activeKey = null;

    expect(activeKey).toBeNull();
    // Cannot decrypt without activeKey
    // @ts-expect-error verifying null key throws
    await expect(decryptVaultData(payload, activeKey)).rejects.toThrow();
  });
});

