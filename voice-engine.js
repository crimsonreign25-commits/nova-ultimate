/**
 * NOVA Ultimate — Native Voice Core
 *
 * NOVA owns voice selection, prosody, speaking policy and playback instructions.
 * It has NO required third-party TTS provider. The default playback backend is
 * the device/browser's native Speech Synthesis engine, so NOVA can speak without
 * ElevenLabs or an API key. External providers may be added later as optional
 * adapters without becoming a dependency of the core.
 */

const VOICES = [
  { id: 'nova', name: 'NOVA', description: 'Futuristic, intelligent and balanced', defaultSpeed: 1.0, pitch: 0.98, preferred: ['Google UK English Female', 'Microsoft Zira', 'Samantha'] },
  { id: 'jarvis', name: 'JARVIS', description: 'Precise, formal and technical', defaultSpeed: 0.96, pitch: 0.82, preferred: ['Microsoft David', 'Google UK English Male', 'Alex'] },
  { id: 'friday', name: 'FRIDAY', description: 'Warm, calm and conversational', defaultSpeed: 1.02, pitch: 1.05, preferred: ['Samantha', 'Microsoft Zira', 'Google US English'] },
  { id: 'atlas', name: 'ATLAS', description: 'Deep, commanding and steady', defaultSpeed: 0.92, pitch: 0.72, preferred: ['Microsoft David', 'Alex', 'Google UK English Male'] },
  { id: 'lyra', name: 'LYRA', description: 'Friendly, expressive and natural', defaultSpeed: 1.04, pitch: 1.08, preferred: ['Samantha', 'Google US English', 'Microsoft Zira'] },
  { id: 'orion', name: 'ORION', description: 'Powerful, cinematic and composed', defaultSpeed: 0.94, pitch: 0.86, preferred: ['Microsoft David', 'Alex', 'Google UK English Male'] }
];

const PROVIDERS = [{ id: 'native', label: 'NOVA Native Voice Core', required: true }];

function normalizeId(value) {
  const id = String(value || '').trim().toLowerCase();
  return VOICES.some((voice) => voice.id === id) ? id : 'nova';
}

export class VoiceEngine {
  voices() {
    return VOICES.map((voice) => ({
      id: voice.id,
      name: voice.name,
      description: voice.description,
      configured: true,
      provider: 'native',
      defaultSpeed: voice.defaultSpeed,
      pitch: voice.pitch,
      preferredVoices: voice.preferred
    }));
  }

  getVoice(id = 'nova') {
    const normalized = normalizeId(id);
    return VOICES.find((voice) => voice.id === normalized) || VOICES[0];
  }

  configuredProviders() { return PROVIDERS; }

  status() {
    return {
      engine: 'NOVA Native Voice Core',
      version: '21.2.1',
      defaultVoice: normalizeId(process.env.NOVA_DEFAULT_VOICE || 'nova'),
      providers: PROVIDERS.map((provider) => ({ id: provider.id, label: provider.label, configured: true, required: provider.required })),
      voices: this.voices(),
      ready: true,
      externalProviderRequired: false,
      elevenLabsOptional: Boolean(process.env.ELEVENLABS_API_KEY)
    };
  }

  async speak({ text, voice = 'nova', speed } = {}) {
    if (typeof text !== 'string' || !text.trim()) {
      throw Object.assign(new Error('text is required'), { code: 'INVALID_TEXT' });
    }
    const selected = this.getVoice(voice);
    const selectedSpeed = Number.isFinite(Number(speed))
      ? Math.min(1.2, Math.max(0.8, Number(speed)))
      : selected.defaultSpeed;

    return {
      voice: selected.id,
      voiceName: selected.name,
      provider: 'native',
      engine: 'NOVA Native Voice Core',
      contentType: 'application/json',
      playback: 'speechSynthesis',
      text: text.slice(0, 5000),
      rate: selectedSpeed,
      pitch: selected.pitch,
      preferredVoices: selected.preferred
    };
  }
}

export { VOICES };
