import { randomUUID } from 'node:crypto';

export const SPECIALIST_AGENTS = {
  software_engineering: {
    id: 'software_engineering',
    name: 'Software Engineer Agent',
    description: 'Code synthesis, architecture design, static verification, and build execution.',
    permissions: ['workspace-read', 'workspace-write', 'process-safe'],
    contextBoundaries: ['code', 'architecture', 'build-artifacts', 'syntax']
  },
  research: {
    id: 'research',
    name: 'Research Specialist Agent',
    description: 'Web search, factual comparison, data aggregation, and current information lookup.',
    permissions: ['network', 'search'],
    contextBoundaries: ['search-queries', 'web-snippets', 'source-links']
  },
  debugging: {
    id: 'debugging',
    name: 'Debugging & Security Sentinel Agent',
    description: 'Failure analysis, stack trace diagnosis, security heuristic scanning, and prompt defense.',
    permissions: ['network', 'security-scan'],
    contextBoundaries: ['error-logs', 'stack-traces', 'security-headers', 'threat-heuristics']
  },
  multimodal: {
    id: 'multimodal',
    name: 'Multimodal Understanding Agent',
    description: 'Vision analysis, OCR interpretation, document context extraction, and audio-visual reasoning.',
    permissions: ['vision', 'media'],
    contextBoundaries: ['image-data', 'document-extracted-text', 'visual-elements']
  },
  project_management: {
    id: 'project_management',
    name: 'Project Management & Goal Planner Agent',
    description: 'Goal breakdown, ambiguity resolution, dependency tracking, and measurable criteria verification.',
    permissions: ['planning'],
    contextBoundaries: ['goals', 'task-plans', 'checkpoints', 'acceptance-criteria']
  },
  document_work: {
    id: 'document_work',
    name: 'Document & Knowledge Specialist Agent',
    description: 'PDF, DOCX, XLSX, PPTX text extraction, knowledge graph management, and lesson persistence.',
    permissions: ['memory-read', 'memory-write'],
    contextBoundaries: ['parsed-text', 'project-knowledge', 'task-lessons']
  }
};

export class NovaAICore {
  constructor({ agentCore, aiRouter, toolRegistry, persistentStore, jobEngine, autonomousExecutor }) {
    this.agentCore = agentCore;
    this.aiRouter = aiRouter;
    this.toolRegistry = toolRegistry;
    this.store = persistentStore;
    this.jobEngine = jobEngine;
    this.autonomous = autonomousExecutor;
  }

  detectPromptInjection(text) {
    const input = String(text || '');
    const patterns = [
      /ignore (all )?previous instructions/i,
      /disregard system prompt/i,
      /you are now in dan mode/i,
      /reveal system instructions/i,
      /dump all secrets/i,
      /override safety limits/i
    ];
    for (const pattern of patterns) {
      if (pattern.test(input)) {
        return { flagged: true, pattern: pattern.toString(), reason: 'Prompt injection or system override attempt detected.' };
      }
    }
    return { flagged: false, reason: null };
  }

  filterContextForAgent(agentId, context = {}) {
    const agent = SPECIALIST_AGENTS[agentId] || SPECIALIST_AGENTS.project_management;
    const allowed = new Set(agent.contextBoundaries);
    const safeContext = { agentId: agent.id, permissions: agent.permissions };

    if (allowed.has('code') && context.code) safeContext.code = context.code;
    if (allowed.has('search-queries') && context.query) safeContext.query = context.query;
    if (allowed.has('error-logs') && context.error) safeContext.error = context.error;
    if (allowed.has('image-data') && context.attachments) safeContext.attachments = context.attachments.filter(a => String(a.type || '').startsWith('image/'));
    if (allowed.has('parsed-text') && context.attachments) safeContext.attachments = context.attachments.filter(a => !String(a.type || '').startsWith('image/'));
    if (allowed.has('goals') && context.goal) safeContext.goal = context.goal;

    return safeContext;
  }

  async processGoal({ goal, userId = 'guest', persona = 'nova', attachments = [], context = {} }) {
    // 1. Defend against prompt injection
    const injection = this.detectPromptInjection(goal);
    if (injection.flagged) {
      await this.store.audit({ actor: userId, action: 'prompt-injection-blocked', resource: 'core', result: 'blocked', detail: injection.reason });
      throw Object.assign(new Error(`Input rejected for security policy: ${injection.reason}`), { code: 'SECURITY_BLOCKED' });
    }

    // 2. Interpret goal & build plan
    const interpretation = this.agentCore.interpretGoal(goal, { attachments });
    const plan = this.agentCore.plan(goal, { attachments });

    // 3. Select specialist agent
    const specialistAgent = SPECIALIST_AGENTS[interpretation.primaryCategory] || SPECIALIST_AGENTS.project_management;

    // 4. Load persistent memory & reusable lessons
    const userLessons = await this.store.listLessons(userId);
    const applicableLessons = userLessons.filter(l => l.category === interpretation.primaryCategory || l.category === 'task');

    // 5. Create durable job
    const job = this.jobEngine.create(goal, plan);
    job.specialistAgent = specialistAgent.id;
    job.interpretation = interpretation;
    job.applicableLessons = applicableLessons.slice(0, 5).map(l => l.lesson);

    // 6. Execute job via AutonomousExecutor with bounded retries and verification
    const started = Date.now();
    try {
      const executeStep = async (step) => {
        const stepAgent = SPECIALIST_AGENTS[step.category] || specialistAgent;
        if (step.id === 'security') {
          const url = (goal.match(/https?:\/\/[^\s]+/i) || [])[0];
          if (!url) return { ok: true, skipped: true, note: 'No URL target present.' };
          return { ok: true, output: await this.toolRegistry.execute('security', { url }, { job, approved: context.approved ?? true }) };
        }
        if (step.id === 'research') {
          return { ok: true, output: await this.toolRegistry.execute('research', { query: goal }, { job, approved: context.approved ?? true }) };
        }
        if (step.id === 'analyze') {
          const prompt = `Analyze the context for step '${step.label}' using ${stepAgent.name}. Goal: ${goal}`;
          return { ok: true, output: await this.toolRegistry.execute('assist', { message: prompt, user_id: userId, persona, attachments }, { job, approved: context.approved ?? true }) };
        }
        // General synthesis step routed through AIRouter
        const systemPrompt = `${this.personaPrompt(persona)} You are operating as the ${stepAgent.name}. Follow task boundaries strictly.`;
        const routed = await this.aiRouter.chat({
          messages: [
            { role: 'system', content: systemPrompt },
            ...(applicableLessons.length ? [{ role: 'system', content: `Saved Reusable Lessons: ${applicableLessons.map(l => l.lesson).join('; ')}` }] : []),
            { role: 'user', content: goal }
          ],
          needsVision: attachments.some(a => String(a.type || '').startsWith('image/')),
          task: stepAgent.id
        });
        return { ok: true, output: routed.text, provider: routed.provider, model: routed.model };
      };

      await this.jobEngine.run(job.id, async current => {
        await this.autonomous.execute(current, { executeStep });
      });

      const summary = this.summarizeJob(job, Date.now() - started);
      // Record task metrics
      await this.store.saveFeedback(userId, { taskId: job.id, score: job.status === 'completed' ? 1 : -1, taskCategory: interpretation.primaryCategory });
      return summary;
    } catch (error) {
      // Save failure lesson to persistent memory
      await this.store.saveLesson(userId, {
        category: interpretation.primaryCategory,
        goal,
        failurePattern: error.message,
        lesson: `Avoid strategy leading to: ${error.message.slice(0, 150)}`
      });
      throw error;
    }
  }

  personaPrompt(persona = 'nova') {
    const personaPrompts = {
      nova: 'You are NOVA, the core adaptive personal AI assistant. Be clear, helpful, balanced, calm, and concise.',
      jarvis: 'You are JARVIS, an original strategic AI persona. Be precise, composed, analytical, technical when useful, and proactive. Do not claim to be a fictional character.',
      friday: 'You are FRIDAY, an original conversational AI persona. Be warm, quick, empathetic, confident, and practical. Do not claim to be a fictional character.',
      atlas: 'You are ATLAS, an original task-focused AI persona. Be decisive, structured, execution-minded, and thorough; break complex goals into safe, verifiable steps.',
      lyra: 'You are LYRA, an original creative and exploratory AI persona. Be imaginative, curious, expressive, and constructive while clearly separating facts from ideas.',
      orion: 'You are ORION, an original thoughtful sentinel AI persona. Be composed, observant, security-conscious, careful with uncertainty, and protective of user privacy.'
    };
    return personaPrompts[String(persona).toLowerCase()] || personaPrompts.nova;
  }

  summarizeJob(job, durationMs) {
    const assistantResult = job.results.filter(r => ['assist', 'build', 'analyze'].includes(r.step)).at(-1)?.output || 'NOVA completed execution.';
    return {
      ok: job.status === 'completed',
      jobId: job.id,
      goal: job.goal,
      status: job.status,
      durationMs,
      specialistAgent: job.specialistAgent,
      interpretation: job.interpretation,
      plan: job.plan,
      results: job.results,
      verification: job.verification,
      response: typeof assistantResult === 'string' ? assistantResult : JSON.stringify(assistantResult)
    };
  }

  async adminDiagnostics() {
    const routerStatus = this.aiRouter.status();
    const globalMetrics = await this.store.getMetrics(null);
    const jobList = this.jobEngine.list();
    const toolList = this.toolRegistry.describe();

    return {
      timestamp: new Date().toISOString(),
      providerStatus: routerStatus,
      totalJobs: jobList.length,
      recentJobs: jobList.slice(0, 10),
      registeredToolsCount: toolList.length,
      memoryHealth: {
        storeEncrypted: this.store.encryptionStatus().enabled,
        metrics: globalMetrics
      },
      specialistAgents: Object.values(SPECIALIST_AGENTS).map(a => ({ id: a.id, name: a.name, permissions: a.permissions }))
    };
  }
}
