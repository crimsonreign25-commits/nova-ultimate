import test from 'node:test';
import assert from 'node:assert/strict';
import { AIRouter } from './core/ai-router.js';

const old = process.env.NOVA_EXTERNAL_AI_ENABLED;
test('router blocks external provider calls when privacy policy disables cloud AI', async () => {
  process.env.NOVA_EXTERNAL_AI_ENABLED = 'false';
  let called = false;
  const router = new AIRouter({ fetchImpl: async () => { called = true; throw new Error('must not call network'); } });
  await assert.rejects(router.chat({ messages: [{ role: 'user', content: 'private message' }] }), /External AI routing is disabled/);
  assert.equal(called, false);
  assert.equal(router.status().some(p => p.enabled), false);
});

if (old === undefined) delete process.env.NOVA_EXTERNAL_AI_ENABLED; else process.env.NOVA_EXTERNAL_AI_ENABLED = old;
