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

    this.providers = [
      {
        id: 'groq',
        label: 'Groq',
        key: 'GROQ_API_KEY',
        free: true,
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
        capabilities: { text: true, vision: true },
        strengths: ['general', 'reasoning', 'research', 'creative', 'vision'],
        model: () => process.env.GEMINI_MODEL || 'gemini-3.8-flash',
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/models'
      }
    ];
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

  plan({ messages = [], needsVision = false, task = '' } = {}) {
    const selectedTask = classifyTask({ messages, needsVision, task });
    const ranked = this.rankProviders({ needsVision, task: selectedTask });
    return {
      task: selectedTask,
      selectionPolicy: this.paidMode ? 'free-and-paid-enabled' : 'free-first-only',
      available: ranked.map((p) => ({ id: p.id, model: p.model(), score: scoreProvider(p, selectedTask) })),
      providers: ranked.map((p) => p.id),
      supportedTasks: taskList()
    };
  }

  async chat({ messages, needsVision = false, temperature = 0.7, maxTokens = 4096, task = '' }) {
    const selectedTask = classifyTask({ messages, needsVision, task });
    await this.applyDynamicModelSelection({ task: selectedTask, needsVision });
    const ranked = this.rankProviders({ needsVision, task: selectedTask });
    if (!ranked.length) {
      const reason = needsVision
        ? 'No configured free AI provider supports this vision request.'
        : 'No configured free AI provider is available.';
      throw Object.assign(new Error(reason), { code: 'NO_PROVIDER' });
    }

    const failures = [];
    for (const provider of ranked) {
      try {
        const result = provider.id === 'gemini'
          ? await this.callGemini(provider, messages, { temperature, maxTokens, needsVision })
          : await this.callOpenAICompatible(provider, messages, { temperature, maxTokens });

        if (result.text) {
          return { ...result, provider: provider.id, model: result.model || provider.model(), task: selectedTask };
        }
        failures.push(`${provider.id}: empty response`);
      } catch (error) {
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
    return this.providers.map((p) => ({
      id: p.id,
      label: p.label,
      strengths: p.strengths || [],
      configured: Boolean(process.env[p.key]),
      free: p.free,
      enabled: Boolean(process.env[p.key]) && (p.free || this.paidMode),
      capabilities: p.capabilities,
      model: p.model()
    }));
  }
}
