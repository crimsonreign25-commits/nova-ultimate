import assert from 'node:assert/strict';
import { VoiceEngine } from './core/voice-engine.js';

const original = { ...process.env };
try {
  process.env.ELEVENLABS_API_KEY = 'test-key';
  process.env.NOVA_VOICE_ID = 'voice-nova';
  process.env.JARVIS_VOICE_ID = 'voice-jarvis';
  process.env.FRIDAY_VOICE_ID = 'voice-friday';
  process.env.ATLAS_VOICE_ID = 'voice-atlas';
  process.env.LYRA_VOICE_ID = 'voice-lyra';
  process.env.ORION_VOICE_ID = 'voice-orion';

  let calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      headers: { get: () => 'audio/mpeg' },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      text: async () => ''
    };
  };

  const engine = new VoiceEngine({ fetchImpl: fakeFetch });
  const status = engine.status();
  assert.equal(status.engine, 'NOVA Voice Engine');
  assert.equal(status.ready, true);
  assert.equal(status.voices.length, 6);
  assert.equal(status.voices.filter((v) => v.configured).length, 6);

  const result = await engine.speak({ text: 'Hello from NOVA.', voice: 'atlas' });
  assert.equal(result.voice, 'atlas');
  assert.equal(result.voiceName, 'ATLAS');
  assert.equal(result.provider, 'elevenlabs');
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /voice-atlas/);
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.text, 'Hello from NOVA.');
  assert.equal(body.voice_settings.speed, 0.92);

  delete process.env.ORION_VOICE_ID;
  await assert.rejects(
    () => engine.speak({ text: 'test', voice: 'orion' }),
    (error) => error.code === 'VOICE_NOT_CONFIGURED' && error.voice === 'orion'
  );

  console.log('NOVA Voice Engine tests PASS');
} finally {
  for (const key of Object.keys(process.env)) {
    if (!(key in original)) delete process.env[key];
  }
  Object.assign(process.env, original);
}
