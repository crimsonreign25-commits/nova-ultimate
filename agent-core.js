import { randomUUID } from 'node:crypto';
import { RecoveryEngine } from './recovery-engine.js';

const rules = [
  { id:'research', label:'Gather live web intelligence', tool:'research', test:/research|search|latest|news|compare|investigate|find out|sources/i },
  { id:'security', label:'Inspect target security', tool:'security', test:/https?:\/\/|url|security|scan|safe|risk|phishing|malware/i },
  { id:'analyze', label:'Analyze provided context', tool:'analyze', test:/analy[sz]|document|file|image|pdf|spreadsheet|data/i },
  { id:'build', label:'Design and build solution', tool:'assist', test:/build|code|create|develop|design|implement|write|solution|app|website|prototype/i }
];

export class AgentCore {
  constructor({ maxSteps = 10, maxRetries = 2, recovery = {} } = {}) {
    this.maxSteps = maxSteps;
    this.recovery = new RecoveryEngine({ maxAttempts: maxRetries + 1, ...recovery });
    this.maxRetries = maxRetries;
  }

  plan(goal, { attachments = [] } = {}) {
    const task = String(goal || '').trim();
    if (!task) return [];
    const steps = [{ id:'interpret', label:'Interpret objective', tool:'reasoning', dependsOn:[] }];
    for (const rule of rules) if (rule.test.test(task)) steps.push({ id:rule.id, label:rule.label, tool:rule.tool, dependsOn:['interpret'] });
    if (attachments.length && !steps.some(s=>s.id==='analyze')) steps.push({ id:'analyze', label:'Analyze provided context', tool:'analyze', dependsOn:['interpret'] });
    if (steps.length === 1) steps.push({ id:'assist', label:'Work through objective', tool:'assist', dependsOn:['interpret'] });
    const workIds = steps.slice(1).map(s=>s.id);
    steps.push({ id:'verify', label:'Verify outputs and assemble result', tool:'verification', dependsOn:workIds });
    return steps.slice(0, this.maxSteps);
  }

  createJob(goal, options = {}) {
    return { id:randomUUID(), goal:String(goal||'').trim(), status:'planned', createdAt:new Date().toISOString(), retries:0, replans:0, attempts:0, plan:this.plan(goal, options) };
  }

  shouldRetry(attempt, category = 'tool') { return this.recovery.shouldRetry(attempt, category); }
  classifyFailure(error) { return this.recovery.classify(error); }
  backoffMs(attempt) { return this.recovery.backoffMs(attempt); }
  replan(plan, failedStep, failure, state) { return this.recovery.replan(plan, failedStep, failure, state); }
  verifyResults(plan, results) { return this.recovery.verifyResults(plan, results); }
}
