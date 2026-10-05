import assert from 'node:assert/strict';
import { AIRouter } from './core/ai-router.js';

const originalEnv = { ...process.env };
const restore = () => {
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  for (const [key, value] of Object.entries(originalEnv)) process.env[key] = value;
};
try {
  process.env.GROQ_API_KEY = 'test-groq';
  process.env.CEREBRAS_API_KEY = 'test-cerebras';
  process.env.NOVA_PROVIDER_ORDER = 'cerebras,groq';
  process.env.NOVA_PAID_MODE = 'false';

  const calls = [];
  const router = new AIRouter({
    fetchImpl: async (url, options) => {
      calls.push({ url, options: JSON.parse(options.body) });
      if (url.includes('cerebras')) {
        return { ok: false, status: 429, json: async () => ({ error: { message: 'rate limited' } }) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: 'Groq fallback works.' } }],
          model: 'openai/gpt-oss-20b'
        })
      };
    }
  });

  const result = await router.chat({
    messages: [{ role: 'user', content: 'hello' }]
  });

  assert.equal(result.provider, 'groq');
  assert.equal(result.text, 'Groq fallback works.');
  assert.equal(result.task, 'general');
  assert.equal(calls.length, 2);

  const plan = router.plan({ messages: [{ role: 'user', content: 'Debug this JavaScript function' }] });
  assert.equal(plan.task, 'coding');
  assert.deepEqual(plan.providers.slice(0, 2), ['cerebras', 'groq']);

  const visionProviders = router.status().filter(p => p.capabilities.vision && p.configured);
  assert.ok(visionProviders.some(p => p.id === 'groq'));

  delete process.env.GROQ_API_KEY;
  delete process.env.CEREBRAS_API_KEY;
  assert.equal(router.configuredProviders().length, 0);
  console.log('NOVA AI router tests PASS');
} finally {
  restore();
}
