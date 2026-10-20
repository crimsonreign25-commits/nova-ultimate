/**
 * NOVA Ultimate — Global AI Router (Step 1)
 *
 * Free-first, failover-capable provider routing.
 * Paid providers are not selected unless NOVA_PAID_MODE=true.
 *
 * Provider adapters intentionally use HTTP directly so NOVA stays dependency-light.
 */

import { classifyTask, rankByTask, scoreProvider, taskList } from './ai-task-router.js';
import { ProviderDiscovery } from './provider-discovery.js';

function envBool(name, fallback = false) {
  const value = String(process.env[name] ?? '').trim().toLowerCase();
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value);
}

function normalizeMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter((m) => m && ['system', 'user', 'assistant'].includes(m.role))
    .map((m) => ({ role: m.role, content: m.content }));
}

function extractOpenAIText(data) {
  return data?.choices?.[0]?.message?.content
    || data?.choices?.[0]?.text
    || '';
}

export class AIRouter {
  constructor({ fetchImpl = globalThis.fetch, discovery = null } = {}) {
    this.fetch = fetchImpl;
    this.discovery = discovery || new ProviderDiscovery({ fetchImpl });
    this.paidMode = envBool('NOVA_PAID_MODE', false);
    this.metrics = new Map(); // providerId -> { attempts, successes, failures, totalLatencyMs, avgLatencyMs, lastUsed, quotaExceeded }

    this.providers = [
      {
        id: 'groq',
        label: 'Groq',
        key: 'GROQ_API_KEY',
        free: true,
        costTier: 'free',
        quotaLimitPerMin: 30,
        capabilities: { text: true, vision: true },
        strengths: ['general', 'coding', 'reasoning', 'vision'],
        model: () => process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
        endpoint: 'https://api.groq.com/openai/v1/chat/completions'
      },
      {
        id: 'cerebras',
        label: 'Cerebras',
        key: 'CEREBRAS_API_KEY',
        free: true,
        costTier: 'free',
        quotaLimitPerMin: 30,
        capabilities: { text: true, vision: false },
        strengths: ['general', 'coding', 'reasoning'],
        model: () => process.env.CEREBRAS_MODEL || 'gpt-oss-120b',
        endpoint: 'https://api.cerebras.ai/v1/chat/completions',
        headers: { 'X-Cerebras-Version-Patch': '2' }
      },
      {
        id: 'openrouter',
        label: 'OpenRouter',
        key: 'OPENROUTER_API_KEY',
        free: true,
        costTier: 'free',
        quotaLimitPerMin: 20,
        capabilities: { text: true, vision: true },
        strengths: ['general', 'research', 'creative', 'vision'],
        model: function () { return this.runtimeModel || process.env.OPENROUTER_FREE_MODEL || 'openrouter/free'; },
        endpoint: 'https://openrouter.ai/api/v1/chat/completions',
        headers: {
          'HTTP-Referer': process.env.NOVA_APP_URL || 'https://nova-ultimate-8scp.onrender.com',
          'X-Title': 'NOVA Ultimate'
        }
      },
      {
        id: 'gemini',
        label: 'Gemini',
        key: 'GEMINI_API_KEY',
        free: true,
        costTier: 'free',
        quotaLimitPerMin: 15,
        capabilities: { text: true, vision: true },
        strengths: ['general', 'reasoning', 'research', 'creative', 'vision'],
        model: () => process.env.GEMINI_MODEL || 'gemini-3.8-flash',
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/models'
      }
    ];

    for (const p of this.providers) {
      this.metrics.set(p.id, { attempts: 0, successes: 0, failures: 0, totalLatencyMs: 0, avgLatencyMs: 0, lastUsed: null, quotaExceeded: false });
    }
  }

  recordMetric(providerId, latencyMs, success, isQuota = false) {
    const m = this.metrics.get(providerId) || { attempts: 0, successes: 0, failures: 0, totalLatencyMs: 0, avgLatencyMs: 0, lastUsed: null, quotaExceeded: false };
    m.attempts += 1;
    m.lastUsed = new Date().toISOString();
    if (success) {
      m.successes += 1;
      m.totalLatencyMs += latencyMs;
      m.avgLatencyMs = Math.round(m.totalLatencyMs / m.successes);
      m.quotaExceeded = false;
    } else {
      m.failures += 1;
      if (isQuota) m.quotaExceeded = true;
    }
    this.metrics.set(providerId, m);
  }

  configuredProviders({ needsVision = false } = {}) {
    return this.providers.filter((p) => {
      if (!process.env[p.key]) return false;
      if (needsVision && !p.capabilities.vision) return false;
      if (!p.free && !this.paidMode) return false;
      return true;
    });
  }

  rankProviders({ needsVision = false, task = '' } = {}) {
    const preferred = String(process.env.NOVA_PROVIDER_ORDER || 'groq,cerebras,gemini,openrouter')
      .split(',').map((x) => x.trim()).filter(Boolean);
    const available = this.configuredProviders({ needsVision });
    const selectedTask = task || (needsVision ? 'vision' : 'general');
    return rankByTask(available, selectedTask, preferred);
  }

  explainNoProvider({ needsVision = false } = {}) {
    if (String(process.env.NOVA_EXTERNAL_AI_ENABLED || 'true').toLowerCase() === 'false') {
      return 'External AI routing is disabled by the NOVA privacy policy. Enable external AI or configure a local model.';
    }
    const unconfigured = this.providers.filter(p => !process.env[p.key]);
    if (unconfigured.length === this.providers.length) {
      return 'No AI provider API keys are configured on the server. Set GROQ_API_KEY, CEREBRAS_API_KEY, GEMINI_API_KEY, or OPENROUTER_API_KEY in process environment.';
    }
    if (needsVision) {
      return 'No configured free AI provider currently supports vision/multimodal requests. Set GROQ_API_KEY, GEMINI_API_KEY, or OPENROUTER_API_KEY.';
    }
    const quotaExceeded = this.providers.filter(p => this.metrics.get(p.id)?.quotaExceeded);
    if (quotaExceeded.length > 0) {
      return `Configured providers (${quotaExceeded.map(p => p.label).join(', ')}) exceeded rate or quota limits.`;
    }
    return 'No configured free AI provider is currently available.';
  }

  plan({ messages = [], needsVision = false, task = '' } = {}) {
    const selectedTask = classifyTask({ messages, needsVision, task });
    const ranked = this.rankProviders({ needsVision, task: selectedTask });
    const noProviderReason = ranked.length === 0 ? this.explainNoProvider({ needsVision }) : null;
    return {
      task: selectedTask,
      selectionPolicy: this.paidMode ? 'free-and-paid-enabled' : 'free-first-only',
      privacy: { externalProvidersEnabled: String(process.env.NOVA_EXTERNAL_AI_ENABLED || 'true').toLowerCase() !== 'false', sendsPromptToProvider: true },
      available: ranked.map((p) => ({
        id: p.id,
        model: p.model(),
        score: scoreProvider(p, selectedTask),
        costTier: p.costTier,
        avgLatencyMs: this.metrics.get(p.id)?.avgLatencyMs || 0
      })),
      providers: ranked.map((p) => p.id),
      noProviderReason,
      supportedTasks: taskList()
    };
  }

  async chat({ messages, needsVision = false, temperature = 0.7, maxTokens = 4096, task = '' }) {
    if (String(process.env.NOVA_EXTERNAL_AI_ENABLED || 'true').toLowerCase() === 'false') {
      throw Object.assign(new Error('External AI routing is disabled by NOVA privacy settings.'), { code: 'EXTERNAL_AI_DISABLED' });
    }
    const selectedTask = classifyTask({ messages, needsVision, task });
    await this.applyDynamicModelSelection({ task: selectedTask, needsVision });
    const ranked = this.rankProviders({ needsVision, task: selectedTask });
    if (!ranked.length) {
      const reason = this.explainNoProvider({ needsVision });
      throw Object.assign(new Error(reason), { code: 'NO_PROVIDER', reason });
    }

    const failures = [];
    for (const provider of ranked) {
      const startTime = Date.now();
      try {
        const result = provider.id === 'gemini'
          ? await this.callGemini(provider, messages, { temperature, maxTokens, needsVision })
          : await this.callOpenAICompatible(provider, messages, { temperature, maxTokens });

        if (result.text) {
          const latencyMs = Date.now() - startTime;
          this.recordMetric(provider.id, latencyMs, true);
          return {
            ...result,
            provider: provider.id,
            model: result.model || provider.model(),
            task: selectedTask,
            latencyMs,
            costTier: provider.costTier || 'free'
          };
        }
        this.recordMetric(provider.id, Date.now() - startTime, false);
        failures.push(`${provider.id}: empty response`);
      } catch (error) {
        const isQuota = /429|quota|rate limit/i.test(error.message);
        this.recordMetric(provider.id, Date.now() - startTime, false, isQuota);
        failures.push(`${provider.id}: ${error.message}`);
      }
    }

    throw Object.assign(new Error(`All configured AI providers failed. ${failures.join(' | ')}`), {
      code: 'ALL_PROVIDERS_FAILED',
      failures
    });
  }

  async callOpenAICompatible(provider, messages, { temperature, maxTokens }) {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env[provider.key]}`,
      ...(provider.headers || {})
    };
    const response = await this.fetch(provider.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: provider.model(),
        messages: normalizeMessages(messages),
        temperature,
        max_tokens: maxTokens
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`${response.status} ${data?.error?.message || data?.error || 'provider request failed'}`);
    }
    return { text: extractOpenAIText(data), usage: data.usage || null };
  }

  async callGemini(provider, messages, { temperature, maxTokens }) {
    const system = messages.find((m) => m.role === 'system')?.content || '';
    const contents = normalizeMessages(messages)
      .filter((m) => m.role !== 'system')
      .map((m) => {
        const raw = Array.isArray(m.content) ? m.content : [{ type: 'text', text: String(m.content ?? '') }];
        const parts = raw.flatMap((part) => {
          if (part?.type === 'text') return [{ text: String(part.text ?? '') }];
          if (part?.type === 'image_url' && part.image_url?.url) {
            const match = String(part.image_url.url).match(/^data:([^;]+);base64,(.+)$/);
            return match ? [{ inlineData: { mimeType: match[1], data: match[2] } }] : [];
          }
          return [];
        });
        return { role: m.role === 'assistant' ? 'model' : 'user', parts: parts.length ? parts : [{ text: '' }] };
      });

    const model = provider.model();
    const endpoint = `${provider.endpoint}/${encodeURIComponent(model)}:generateContent`;
    const response = await this.fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env[provider.key]
      },
      body: JSON.stringify({
        systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        contents,
        generationConfig: { temperature, maxOutputTokens: maxTokens }
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`${response.status} ${data?.error?.message || 'provider request failed'}`);
    }
    const text = data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '').join('') || '';
    return { text, usage: data?.usageMetadata || null };
  }

  async applyDynamicModelSelection({ task = 'general', needsVision = false } = {}) {
    if (String(process.env.NOVA_DYNAMIC_MODEL_SELECTION || 'true').toLowerCase() === 'false') return;
    const candidates = await this.discovery.candidates({
      task,
      needsVision,
      freeOnly: !this.paidMode,
      executableOnly: true,
      limit: 8
    });
    const openRouterCandidate = candidates.find((m) => m.source === 'openrouter');
    const openRouter = this.providers.find((p) => p.id === 'openrouter');
    if (openRouter && openRouterCandidate?.id) openRouter.runtimeModel = openRouterCandidate.id;
  }

  async discoveryStatus({ refresh = false } = {}) {
    if (refresh) await this.discovery.refresh({ force: true });
    return this.discovery.status();
  }

  async discoveredModels(options = {}) {
    return this.discovery.candidates(options);
  }

  status() {
    return this.providers.map((p) => {
      const metric = this.metrics.get(p.id) || {};
      return {
        id: p.id,
        label: p.label,
        strengths: p.strengths || [],
        costTier: p.costTier || 'free',
        configured: Boolean(process.env[p.key]),
        free: p.free,
        enabled: Boolean(process.env[p.key]) && (p.free || this.paidMode) && String(process.env.NOVA_EXTERNAL_AI_ENABLED || 'true').toLowerCase() !== 'false',
        capabilities: p.capabilities,
        model: p.model(),
        metrics: {
          attempts: metric.attempts || 0,
          successes: metric.successes || 0,
          failures: metric.failures || 0,
          avgLatencyMs: metric.avgLatencyMs || 0,
          quotaExceeded: Boolean(metric.quotaExceeded),
          lastUsed: metric.lastUsed || null
        }
      };
    });
  }
}
