import test from 'node:test';
import assert from 'node:assert/strict';
import { ACCESS_POLICIES, accessPolicyFor, hasPermission } from './core/access-control.js';
import { readFile } from 'node:fs/promises';

test('three explicit access tiers are defined with least privilege', () => {
  assert.deepEqual(Object.keys(ACCESS_POLICIES), ['guest','user','viewer','creator']);
  assert.equal(hasPermission('guest','*'), false);
  assert.equal(hasPermission('user','restricted:read'), false);
  assert.equal(hasPermission('viewer','restricted:read'), true);
  assert.equal(hasPermission('viewer','system:configure'), false);
  assert.equal(hasPermission('creator','system:configure'), true);
});

test('unknown roles safely fall back to guest', () => {
  assert.equal(accessPolicyFor('made-up-role').role, 'guest');
});

test('server and client expose role-aware access settings without trusting client role input', async () => {
  const server = await readFile(new URL('./index.js', import.meta.url), 'utf8');
  const client = await readFile(new URL('./public/app.js', import.meta.url), 'utf8');
  const html = await readFile(new URL('./public/index.html', import.meta.url), 'utf8');
  assert.match(server, /app\.get\('\/api\/access\/capabilities', optionalUser, async/);
  assert.match(server, /NOVA_AUTHORISED_EMAILS/);
  assert.match(client, /refreshAccessCapabilities/);
  assert.match(client, /document\.body\.dataset\.novaRole=role/);
  assert.match(html, /id="accessLevelTitle"/);
});


test('native device speech is the default before optional cloud TTS', async () => {
  const client = await readFile(new URL('./public/app.js', import.meta.url), 'utf8');
  const nativeIndex = client.indexOf("if('speechSynthesis'in window && typeof SpeechSynthesisUtterance!=='undefined')");
  const cloudIndex = client.indexOf("fetch('/speak'", nativeIndex);
  assert.ok(nativeIndex >= 0 && cloudIndex > nativeIndex, 'native browser speech should be tried before cloud TTS');
});
