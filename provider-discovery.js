/**
 * NOVA Ultimate — Universal Provider & Model Discovery
 *
 * Discovery is metadata-only. It may read public/official model catalogs, but
 * NOVA executes requests only through explicit, allow-listed provider adapters.
 * Pricing is represented as a policy classification, not guessed from a model
 * name. Free-mode never enables a provider marked paid-only.
 */

const DEFAULT_TTL_MS = 15 * 60 * 1000;

function envBool(name, fallback = false) {
  const value = String(process.env[name] ?? '').trim().toLowerCase();
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value);
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function inferStrengths(model) {
  const text = `${model.id || ''} ${model.name || ''} ${model.description || ''}`.toLowerCase();
  const strengths = new Set(['general']);
  if (/code|coder|dev|program|starcoder|qwen.*coder|deepseek.*r1|reason/.test(text)) strengths.add('coding');
  if (/reason|r1|o1|o3|o4|thinking|math|qwq/.test(text)) strengths.add('reasoning');
  if (/vision|vl|image|multimodal|omni|gemini/.test(text)) strengths.add('vision');
  if (/creative|writing|story|llama|mistral|qwen/.test(text)) strengths.add('creative');
  if (/research|search|compound/.test(text)) strengths.add('research');
  return [...strengths];
}

function priceState({ input, output, providerFree = false } = {}) {
  const prompt = asNumber(input, Infinity);
  const completion = asNumber(output, Infinity);
  if (prompt === 0 && completion === 0) return 'free';
  if (providerFree) return 'free-tier';
  if (prompt !== Infinity || completion !== Infinity) return 'paid';
  return 'unknown';
}

function normalizeOpenRouter(item) {
  const input = item?.architecture?.input_modalities || [];
  const output = item?.architecture?.output_modalities || [];
  const prompt = asNumber(item?.pricing?.prompt, Infinity);
  const completion = asNumber(item?.pricing?.completion, Infinity);
  return {
    source: 'openrouter',
    provider: 'openrouter',
    id: item?.id,
    name: item?.name || item?.id,
    contextLength: asNumber(item?.context_length),
    inputModalities: input,
    outputModalities: output,
    free: prompt === 0 && completion === 0,
    costClass: priceState({ input: prompt, output: completion }),
    promptPricePerToken: prompt,
    completionPricePerToken: completion,
    strengths: inferStrengths(item),
    supportedParameters: item?.supported_parameters || [],
    tools: item?.supported_parameters?.includes?.('tools') || false,
    executable: true
  };
}

function normalizeOpenAIModel(item, { provider, providerFree, capabilities = {} } = {}) {
  const id = item?.id;
  if (!id) return null;
  const text = `${id} ${item?.owned_by || ''}`.toLowerCase();
  const inputModalities = capabilities.vision && /vision|vl|multimodal|omni|gemini/.test(text)
    ? ['text', 'image'] : ['text'];
  return {
    source: provider,
    provider,
    id,
    name: id,
    contextLength: asNumber(item?.context_length || item?.max_context_length),
    inputModalities,
    outputModalities: ['text'],
    free: Boolean(providerFree),
    costClass: providerFree ? 'free-tier' : 'unknown',
    strengths: inferStrengths({ id, name: id }),
    tools: Boolean(item?.supported_parameters?.includes?.('tools')),
    executable: true
  };
}

function normalizeHuggingFace(item) {
  const modalities = item?.architecture?.input_modalities || [];
  const providers = Array.isArray(item?.providers) ? item.providers : [];
  const prices = Array.isArray(item?.pricing) ? item.pricing : [];
  const zeroPrice = prices.length > 0 && prices.every((p) => Number(p?.input) === 0 && Number(p?.output) === 0);
  return {
    source: 'huggingface',
    provider: 'huggingface',
    id: item?.id,
    name: item?.id,
    contextLength: asNumber(item?.context_length),
    inputModalities: modalities,
    outputModalities: item?.architecture?.output_modalities || ['text'],
    free: zeroPrice,
    costClass: zeroPrice ? 'free' : 'credit-or-paid',
    strengths: inferStrengths(item),
    supportsTools: Boolean(item?.supports_tools),
    providers,
    executable: false
  };
}

export class ProviderDiscovery {
  constructor({ fetchImpl = globalThis.fetch, ttlMs = Number(process.env.NOVA_DISCOVERY_TTL_MS) || DEFAULT_TTL_MS } = {}) {
    this.fetch = fetchImpl;
    this.ttlMs = ttlMs;
    this.cache = new Map();
  }

  enabled() { return envBool('NOVA_DISCOVERY_ENABLED', true); }

  async fetchJson(url, options = {}) {
    const response = await this.fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${response.status} catalog request failed`);
    return data;
  }

  async refresh({ force = false } = {}) {
    if (!this.enabled()) return { models: [], sources: [], errors: [], disabled: true };
    const now = Date.now();
    const cached = this.cache.get('catalog');
    if (!force && cached && now - cached.at < this.ttlMs) return cached.value;

    const models = [];
    const sources = [];
    const errors = [];

    // OpenRouter exposes a public model catalog with model pricing metadata.
    try {
      const data = await this.fetchJson('https://openrouter.ai/api/v1/models', process.env.OPENROUTER_API_KEY ? {
        headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` }
      } : {});
      for (const item of Array.isArray(data?.data) ? data.data : []) {
        const normalized = normalizeOpenRouter(item);
        if (normalized?.id) models.push(normalized);
      }
      sources.push('openrouter');
    } catch (error) { errors.push(`openrouter: ${error.message}`); }

    // Hugging Face exposes a large model/provider catalog. A token unlocks
    // authenticated catalog/inference metadata but is not required for the
    // public model discovery path.
    try {
      const data = await this.fetchJson('https://huggingface.co/api/models?inference_provider=all&limit=200', process.env.HF_TOKEN ? {
        headers: { Authorization: `Bearer ${process.env.HF_TOKEN}` }
      } : {});
      for (const item of Array.isArray(data) ? data : []) {
        const normalized = normalizeHuggingFace(item);
        if (normalized?.id) models.push(normalized);
      }
      sources.push('huggingface');
    } catch (error) { errors.push(`huggingface: ${error.message}`); }

    // Official provider catalogs are useful because they reveal which models
    // the configured credential can actually call. They are execution-adapter
    // metadata only; NOVA does not execute arbitrary discovered endpoints.
    const officialCatalogs = [
      {
        id: 'groq', key: 'GROQ_API_KEY', url: 'https://api.groq.com/openai/v1/models',
        providerFree: true, capabilities: { vision: true }
      },
      {
        id: 'cerebras', key: 'CEREBRAS_API_KEY', url: 'https://api.cerebras.ai/v1/models',
        providerFree: true, capabilities: { vision: false }
      },
      {
        id: 'gemini', key: 'GEMINI_API_KEY', url: 'https://generativelanguage.googleapis.com/v1beta/models',
        providerFree: true, capabilities: { vision: true }
      }
    ];

    for (const source of officialCatalogs) {
      if (!process.env[source.key]) continue;
      try {
        const headers = source.id === 'gemini'
          ? { 'x-goog-api-key': process.env[source.key] }
          : { Authorization: `Bearer ${process.env[source.key]}` };
        const data = await this.fetchJson(source.url, { headers });
        const items = Array.isArray(data?.data) ? data.data : (Array.isArray(data?.models) ? data.models : []);
        for (const item of items) {
          const normalized = normalizeOpenAIModel(item, {
            provider: source.id,
            providerFree: source.providerFree,
            capabilities: source.capabilities
          });
          if (normalized) models.push(normalized);
        }
        sources.push(source.id);
      } catch (error) { errors.push(`${source.id}: ${error.message}`); }
    }

    const deduped = [...new Map(models.map((m) => [`${m.source}:${m.id}`, m])).values()];
    const value = {
      models: deduped,
      sources,
      errors,
      refreshedAt: new Date().toISOString()
    };
    this.cache.set('catalog', { at: now, value });
    return value;
  }

  async candidates({ task = 'general', needsVision = false, freeOnly = true, executableOnly = true, limit = 12 } = {}) {
    const catalog = await this.refresh();
    const models = catalog.models.filter((model) => {
      if (freeOnly && !['free', 'free-tier'].includes(model.costClass)) return false;
      if (executableOnly && !model.executable) return false;
      if (needsVision && !model.inputModalities.includes('image')) return false;
      return true;
    });
    const ranked = models.sort((a, b) => {
      const taskScore = (m) => {
        let score = 0;
        if (m.strengths.includes(task)) score += 40;
        if (m.strengths.includes('general')) score += 5;
        if (task === 'vision' && m.inputModalities.includes('image')) score += 25;
        if (m.costClass === 'free') score += 30;
        else if (m.costClass === 'free-tier') score += 20;
        if (m.tools) score += 5;
        score += Math.min(10, Math.log10(Math.max(1, m.contextLength || 1)));
        return score;
      };
      return taskScore(b) - taskScore(a);
    });
    return ranked.slice(0, limit);
  }

  status() {
    const cached = this.cache.get('catalog');
    const models = cached?.value?.models || [];
    return {
      enabled: this.enabled(),
      cached: Boolean(cached),
      refreshedAt: cached?.value?.refreshedAt || null,
      sources: cached?.value?.sources || [],
      modelCount: models.length,
      freeModelCount: models.filter((m) => m.costClass === 'free').length,
      freeTierModelCount: models.filter((m) => m.costClass === 'free-tier').length,
      paidModelCount: models.filter((m) => m.costClass === 'paid' || m.costClass === 'credit-or-paid').length,
      errors: cached?.value?.errors || []
    };
  }
}
