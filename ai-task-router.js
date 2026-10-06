/**
 * NOVA Ultimate — AI Task Router
 * Deterministically classifies a request and scores configured providers.
 * This layer does not call an LLM just to choose an LLM, keeping routing free and predictable.
 */

const TASKS = Object.freeze(['vision', 'coding', 'reasoning', 'research', 'creative', 'general']);

const TASK_RULES = [
  { task: 'vision', test: ({ needsVision }) => needsVision },
  { task: 'coding', test: ({ text }) => /\b(code|coding|program|programming|debug|bug|stack trace|javascript|typescript|python|java|sql|html|css|api|function|class|regex|repository|repo|github|git|npm|compile|compiler)\b/i.test(text) },
  { task: 'research', test: ({ text }) => /\b(research|sources|cite|citations|compare studies|latest|current|look up|investigate|evidence|papers|news)\b/i.test(text) },
  { task: 'reasoning', test: ({ text }) => /\b(prove|derive|calculate|equation|math|reason|reasoning|analyze|analysis|logic|step by step|trade-?off|architecture|plan)\b/i.test(text) },
  { task: 'creative', test: ({ text }) => /\b(write|rewrite|story|poem|lyrics|caption|brainstorm|creative|design|script|copywriting)\b/i.test(text) }
];

export function classifyTask({ messages = [], needsVision = false, task = '' } = {}) {
  const explicit = String(task || '').trim().toLowerCase();
  if (TASKS.includes(explicit)) return explicit;
  const text = messages.map((m) => typeof m?.content === 'string' ? m.content : '').join('\n').slice(-12000);
  for (const rule of TASK_RULES) if (rule.test({ text, needsVision })) return rule.task;
  return 'general';
}

export function scoreProvider(provider, task) {
  if (!provider) return -Infinity;
  if (task === 'vision' && !provider.capabilities?.vision) return -Infinity;
  const strengths = new Set(provider.strengths || []);
  let score = strengths.has(task) ? 40 : 0;
  if (strengths.has('general')) score += 5;
  if (provider.free) score += 10;
  return score;
}

export function rankByTask(providers, task, preferred = []) {
  const preference = new Map(preferred.map((id, index) => [id, index]));
  return [...providers].sort((a, b) => {
    const scoreDiff = scoreProvider(b, task) - scoreProvider(a, task);
    if (scoreDiff) return scoreDiff;
    return (preference.get(a.id) ?? 999) - (preference.get(b.id) ?? 999);
  });
}

export function taskList() { return [...TASKS]; }
