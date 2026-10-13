import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('./index.js', import.meta.url), 'utf8');
const client = await readFile(new URL('./public/app.js', import.meta.url), 'utf8');

test('Creator identity comes from server-verified Supabase identity', () => {
  assert.match(server, /app\.get\('\/api\/auth\/me', requireUser, async/);
  assert.match(server, /const role = await roleFor\(req\)/);
  assert.match(server, /NOVA_CREATOR_EMAIL/);
  assert.match(server, /NOVA_CREATOR_USER_ID/);
  assert.match(server, /access: \{ role, label:/);
});

test('UI consumes server-returned role and displays Creator status', () => {
  assert.match(client, /accountSession\.access = identity\.access/);
  assert.match(client, /Creator • Full Experience/);
  assert.match(client, /hydrateVerifiedIdentity\(\)/);
});
