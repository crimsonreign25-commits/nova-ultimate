import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const PREFIX = 'NOVAENC1:';
const KEY_ENV = 'NOVA_DATA_ENCRYPTION_KEY';

function loadKey() {
  const raw = String(process.env[KEY_ENV] || '').trim();
  if (!raw) return null;
  // Require a randomly generated 256-bit key. This avoids silently using weak passphrases.
  if (!/^[a-f\d]{64}$/i.test(raw)) {
    throw new Error(`${KEY_ENV} must be exactly 64 hexadecimal characters (32 random bytes).`);
  }
  return Buffer.from(raw, 'hex');
}

export function storeEncryptionStatus() {
  let key;
  try { key = loadKey(); }
  catch (error) { return { enabled: false, valid: false, algorithm: 'AES-256-GCM', error: error.message }; }
  return { enabled: Boolean(key), valid: true, algorithm: 'AES-256-GCM', keySource: key ? 'environment' : 'not-configured' };
}

export function encryptStoreText(plainText) {
  const key = loadKey();
  if (!key) return String(plainText);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptStoreText(storedText) {
  const raw = String(storedText);
  if (!raw.startsWith(PREFIX)) {
    if (loadKey()) return { text: raw, encrypted: false };
    return { text: raw, encrypted: false };
  }
  const key = loadKey();
  if (!key) throw new Error('Encrypted NOVA data was found, but NOVA_DATA_ENCRYPTION_KEY is not configured. Set the original key to recover the data.');
  const packed = Buffer.from(raw.slice(PREFIX.length), 'base64');
  if (packed.length < 29) throw new Error('Encrypted NOVA data is incomplete or corrupt.');
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const ciphertext = packed.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  return { text: decrypted, encrypted: true };
}

export function encryptStoreFileText(text) {
  return encryptStoreText(text);
}

export function isEncryptedStoreText(text) {
  return String(text).startsWith(PREFIX);
}
