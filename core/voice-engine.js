/**
 * NOVA Ultimate — Voice Engine (Step 2)
 *
 * Owns NOVA's voice profiles and speech-provider abstraction.
 * Provider credentials stay server-side. Voice selection is a NOVA concern;
 * ElevenLabs (or another provider later) is only a speech-generation backend.
 */

const VOICES = [
  { id: 'nova', name: 'NOVA', description: 'Futuristic, intelligent and balanced', env: 'NOVA_VOICE_ID', defaultSpeed: 1.0 },
  { id: 'jarvis', name: 'JARVIS', description: 'Precise, formal and technical', env: 'JARVIS_VOICE_ID', defaultSpeed: 0.96 },
  { id: 'friday', name: 'FRIDAY', description: 'Warm, calm and conversational', env: 'FRIDAY_VOICE_ID', defaultSpeed: 1.02 },
  { id: 'atlas', name: 'ATLAS', description: 'Deep, commanding and steady', env: 'ATLAS_VOICE_ID', defaultSpeed: 0.92 },
  { id: 'lyra', name: 'LYRA', description: 'Friendly, expressive and natural', env: 'LYRA_VOICE_ID', defaultSpeed: 1.04 },
  { id: 'orion', name: 'ORION', description: 'Powerful, cinematic and composed', env: 'ORION_VOICE_ID', defaultSpeed: 0.94 }
];

const PROVIDERS = [
  { id: 'elevenlabs', label: 'ElevenLabs', key: 'ELEVENLABS_API_KEY', free: false }
];

function normalizeId(value) {
  const id = String(value || '').trim().toLowerCase();
  return VOICES.some((voice) => voice.id === id) ? id : 'nova';
}

export class VoiceEngine {
  constructor({ fetchImpl = globalThis.fetch } = {}) {
    this.fetch = fetchImpl;
  }

  voices() {
    return VOICES.map((voice) => ({
      id: voice.id,
      name: voice.name,
      description: voice.description,
      configured: Boolean(process.env[voice.env]),
      provider: 'elevenlabs',
      defaultSpeed: voice.defaultSpeed
    }));
  }

  getVoice(id = 'nova') {
    const normalized = normalizeId(id);
    return VOICES.find((voice) => voice.id === normalized) || VOICES[0];
  }

  configuredProviders() {
    return PROVIDERS.filter((provider) => Boolean(process.env[provider.key]));
  }

  status() {
    return {
      engine: 'NOVA Voice Engine',
      version: '1.0.0',
      defaultVoice: normalizeId(process.env.NOVA_DEFAULT_VOICE || 'nova'),
      providers: PROVIDERS.map((provider) => ({
        id: provider.id,
        label: provider.label,
        configured: Boolean(process.env[provider.key])
      })),
      voices: this.voices(),
      ready: this.configuredProviders().length > 0
    };
  }

  async speak({ text, voice = 'nova', speed } = {}) {
    if (typeof text !== 'string' || !text.trim()) {
      throw Object.assign(new Error('text is required'), { code: 'INVALID_TEXT' });
    }

    const selected = this.getVoice(voice);
    const voiceId = process.env[selected.env];
    if (!voiceId) {
      throw Object.assign(
        new Error(`${selected.name} is not configured yet. Add ${selected.env} in Render.`),
        { code: 'VOICE_NOT_CONFIGURED', voice: selected.id }
      );
    }

    if (!process.env.ELEVENLABS_API_KEY) {
      throw Object.assign(
        new Error('No speech provider is configured. Add ELEVENLABS_API_KEY in Render.'),
        { code: 'NO_TTS_PROVIDER' }
      );
    }

    const selectedSpeed = Number.isFinite(Number(speed))
      ? Math.min(1.2, Math.max(0.8, Number(speed)))
      : selected.defaultSpeed;

    const response = await this.fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': process.env.ELEVENLABS_API_KEY
        },
        body: JSON.stringify({
          text: text.slice(0, 5000),
          model_id: process.env.ELEVENLABS_MODEL || 'eleven_flash_v2_5',
          voice_settings: {
            stability: Number(process.env.NOVA_VOICE_STABILITY || 0.5),
            similarity_boost: Number(process.env.NOVA_VOICE_SIMILARITY || 0.75),
            style: Number(process.env.NOVA_VOICE_STYLE || 0.15),
            use_speaker_boost: true,
            speed: selectedSpeed
          }
        })
      }
    );

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      throw Object.assign(
        new Error(`Speech provider failed (${response.status})`),
        { code: 'TTS_PROVIDER_FAILED', status: response.status, details: details.slice(0, 500) }
      );
    }

    return {
      audio: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers?.get?.('content-type') || 'audio/mpeg',
      voice: selected.id,
      voiceName: selected.name,
      provider: 'elevenlabs'
    };
  }
}

export { VOICES };
