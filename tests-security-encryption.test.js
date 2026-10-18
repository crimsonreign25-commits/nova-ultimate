import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decryptStoreText, encryptStoreText, storeEncryptionStatus } from './core/secure-store-crypto.js';
import { PersistentStore } from './core/persistent-store.js';

const originalKey = process.env.NOVA_DATA_ENCRYPTION_KEY;
const originalNodeEnv = process.env.NODE_ENV;
const key = '7f'.repeat(32);

test('AES-256-GCM encrypts data and authenticates ciphertext', () => {
  process.env.NOVA_DATA_ENCRYPTION_KEY = key;
  const secret = JSON.stringify([{ text: 'private chat payload' }]);
  const encrypted = encryptStoreText(secret);
  assert.ok(encrypted.startsWith('NOVAENC1:'));
  assert.equal(encrypted.includes('private chat payload'), false);
  assert.deepEqual(decryptStoreText(encrypted), { text: secret, encrypted: true });
  const packed = Buffer.from(encrypted.slice('NOVAENC1:'.length), 'base64');
  packed[packed.length - 1] ^= 1;
  assert.throws(() => decryptStoreText(`NOVAENC1:${packed.toString('base64')}`));
});

test('persistent chat data is encrypted on disk and readable after restart with the same key', async () => {
  process.env.NOVA_DATA_ENCRYPTION_KEY = key;
  const root = await mkdtemp(join(tmpdir(), 'nova-secure-store-'));
  try {
    const store = new PersistentStore({ root });
    await store.init();
    await store.saveConversation('account-1', { id: 'private-1', title: 'Private', messages: [{ role: 'user', text: 'TOP_SECRET_CHAT_TEXT' }] });
    const onDisk = await readFile(join(root, 'conversations.json'), 'utf8');
    assert.ok(onDisk.startsWith('NOVAENC1:'));
    assert.equal(onDisk.includes('TOP_SECRET_CHAT_TEXT'), false);
    const restarted = new PersistentStore({ root });
    await restarted.init();
    const result = await restarted.getConversation('account-1', 'private-1');
    assert.equal(result.messages[0].text, 'TOP_SECRET_CHAT_TEXT');
    assert.equal(storeEncryptionStatus().enabled, true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('production refuses to start the persistent store without a valid encryption key', async () => {
  delete process.env.NOVA_DATA_ENCRYPTION_KEY;
  process.env.NODE_ENV = 'production';
  const root = await mkdtemp(join(tmpdir(), 'nova-prod-store-'));
  try { await assert.rejects(new PersistentStore({ root }).init(), /NOVA_DATA_ENCRYPTION_KEY/); }
  finally { await rm(root, { recursive: true, force: true }); }
});

if (originalKey === undefined) delete process.env.NOVA_DATA_ENCRYPTION_KEY; else process.env.NOVA_DATA_ENCRYPTION_KEY = originalKey;
if (originalNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalNodeEnv;
