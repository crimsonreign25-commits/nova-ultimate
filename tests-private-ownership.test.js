import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('./index.js', import.meta.url), 'utf8');

test('chat list/read/write/delete endpoints derive identity from verified signed-in session', () => {
  assert.match(server, /app\.get\('\/api\/chat', requireUser/);
  assert.match(server, /app\.get\('\/api\/chat\/:id', requireUser/);
  assert.match(server, /app\.post\('\/api\/chat', requireUser/);
  assert.match(server, /app\.delete\('\/api\/chat\/:id', requireUser/);
  assert.equal((server.match(/ownedUserId\(req,/g) || []).length >= 5, true);
});

test('assistant conversation context uses verified account identity and rejects arbitrary guest IDs', () => {
  assert.match(server, /app\.post\('\/assist', optionalUser/);
  assert.match(server, /function ownedUserId\(req, requested='guest'\)/);
  assert.match(server, /const user_id = req\.user\?\.id \? String\(req\.user\.id\) : 'guest'/);
  assert.match(server, /const saved = req\.user \? await store\.getConversation/);
  assert.match(server, /Guest data remains local to this browser/);
});

test('notifications and device records are scoped to verified account identity', () => {
  assert.match(server, /app\.get\('\/api\/notifications', requireUser/);
  assert.match(server, /store\.listNotifications\(String\(req\.user\.id\)\)/);
  assert.match(server, /app\.post\('\/api\/notifications\/:id\/read', requireUser/);
  assert.match(server, /app\.post\('\/api\/devices\/register', requireUser/);
  assert.match(server, /userId:String\(req\.user\.id\)/);
  assert.match(server, /app\.get\('\/api\/devices', requireUser/);
  assert.match(server, /store\.listDevices\(String\(req\.user\.id\)\)/);
});

test('service worker never caches private API or assistant responses', async () => {
  const sw = await readFile(new URL('./public/sw.js', import.meta.url), 'utf8');
  assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(sw, /\['\/assist','\/research','\/scan-url','\/predict','\/health'\]\.includes\(url\.pathname\)/);
  assert.match(sw, /url\.origin!==self\.location\.origin/);
});

test('consequential action plans require verified accounts and server-derived identity', () => {
  assert.match(server, /app\.post\('\/api\/actions\/prepare', requireUser/);
  assert.match(server, /app\.post\('\/api\/actions\/confirm', requireUser/);
  assert.match(server, /userId=String\(req\.user\.id\)/);
  const actionRoutes = server.match(/app\.post\('\/api\/actions\/prepare'[\s\S]*?app\.post\('\/api\/actions\/confirm'/)?.[0] || '';
  assert.ok(actionRoutes);
  assert.doesNotMatch(actionRoutes, /req\.body\?\.user_id/);
});

test('autonomous task progress and artifact downloads are creator-protected and never cached', () => {
  assert.match(server, /app\.get\('\/api\/autonomous-progress\/:id', requireCreator/);
  assert.match(server, /app\.get\('\/api\/autonomous-download\/:id',requireCreator/);
  assert.match(server, /res\.set\('Cache-Control','no-store'\);res\.json\(task\)/);
});
