import assert from 'node:assert/strict';
import { VoiceEngine } from './core/voice-engine.js';

const engine = new VoiceEngine();
const status = engine.status();
assert.equal(status.engine, 'NOVA Native Voice Core');
assert.equal(status.version, '21.2.1');
assert.equal(status.ready, true);
assert.equal(status.externalProviderRequired, false);
assert.equal(status.voices.length, 6);
assert.equal(status.voices.every((v) => v.configured && v.provider === 'native'), true);

const result = await engine.speak({ text: 'Hello from NOVA.', voice: 'atlas' });
assert.equal(result.voice, 'atlas');
assert.equal(result.voiceName, 'ATLAS');
assert.equal(result.provider, 'native');
assert.equal(result.playback, 'speechSynthesis');
assert.equal(result.rate, 0.92);
assert.equal(result.pitch, 0.72);

await assert.rejects(() => engine.speak({ text: '' }), (error) => error.code === 'INVALID_TEXT');

console.log('NOVA Native Voice Core tests PASS');
