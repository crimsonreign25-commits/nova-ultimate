import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const server = await readFile(new URL('./index.js', import.meta.url), 'utf8');
const router = await readFile(new URL('./core/ai-router.js', import.meta.url), 'utf8');
const ui = await readFile(new URL('./public/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('./public/index.html', import.meta.url), 'utf8');

test('server applies security headers, production HTTPS handling, origin allowlist and request limits', () => {
  assert.match(server, /app\.use\(helmet\(/);
  assert.match(server, /req\.secure/);
  assert.match(server, /allowedOrigins\.has\(origin\)/);
  assert.match(server, /authLimiter/);
  assert.match(server, /assistantLimiter/);
  assert.match(server, /Cache-Control', 'no-store, private, max-age=0'/);
});

test('router can disable cloud provider calls and UI discloses provider processing', () => {
  assert.match(router, /NOVA_EXTERNAL_AI_ENABLED/);
  assert.match(server, /app\.get\('\/api\/security\/status'/);
  assert.match(ui, /selected provider receives your prompt/);
  assert.match(html, /NOVA chat privacy settings/);
});
