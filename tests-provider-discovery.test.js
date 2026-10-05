import assert from 'node:assert/strict';
import { ProviderDiscovery } from './core/provider-discovery.js';

let calls = [];
const discovery = new ProviderDiscovery({
  fetchImpl: async (url) => {
    calls.push(url);
    if (url.includes('openrouter.ai')) return {
      ok: true,
      json: async () => ({ data: [
        { id: 'open/free-coder', name: 'Free Coder', architecture: { input_modalities: ['text'], output_modalities: ['text'] }, context_length: 32768, pricing: { prompt: '0', completion: '0' }, description: 'coding model', supported_parameters: ['tools'] },
        { id: 'open/paid-vision', name: 'Vision', architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] }, context_length: 65536, pricing: { prompt: '0.1', completion: '0.1' }, description: 'vision model' }
      ] })
    };
    if (url.includes('huggingface.co')) return { ok: true, json: async () => [] };
    throw new Error('unexpected source');
  },
  ttlMs: 60000
});

process.env.OPENROUTER_API_KEY = '';
process.env.NOVA_DISCOVERY_ENABLED = 'true';

const coding = await discovery.candidates({ task: 'coding', freeOnly: true });
assert.equal(coding[0].id, 'open/free-coder');
assert.equal(coding[0].costClass, 'free');
assert.equal(coding[0].tools, true);
const vision = await discovery.candidates({ task: 'vision', needsVision: true, freeOnly: true });
assert.equal(vision.length, 0, 'paid vision model must not appear in free-only routing');
const second = await discovery.candidates({ task: 'general', freeOnly: true });
assert.equal(second.length, 1);
assert.equal(calls.length, 2, 'catalog should be cached across candidate calls');

console.log('NOVA provider discovery tests PASS');
