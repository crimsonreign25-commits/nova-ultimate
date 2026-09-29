import { randomUUID } from 'node:crypto';
export class Orchestrator {
  constructor({ registry = {}, maxRetries = 2 } = {}) { this.registry = registry; this.maxRetries = maxRetries; this.jobs = new Map(); }
  register(name, handler) { this.registry[name] = handler; return this; }
  async execute(request, context = {}) { const plan = context.plan || [{ name: 'assistant', input: request }]; const job = { id: randomUUID(), request, status: 'running', completed: 0, total: plan.length, results: [], errors: [] }; this.jobs.set(job.id, job); try { for (const step of plan) { const handler = this.registry[step.name]; if (!handler) { job.errors.push(`Handler not found: ${step.name}`); continue; } try { const result = await Promise.race([handler(step.input, context), new Promise((_, r) => setTimeout(() => r(new Error('Step timeout')), 30000))]); job.results.push(result); job.completed++; } catch (err) { job.errors.push(err.message); } } job.status = 'completed'; } catch (err) { job.status = 'failed'; job.errors.push(err.message); } return job; }
  getProgress(id) { return this.jobs.get(id) || null; }
}
