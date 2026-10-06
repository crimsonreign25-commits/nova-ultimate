/**
 * NOVA Autonomous Execution Layer
 * Bounded execution state machine: Goal -> Plan -> Execute -> Verify -> Recover.
 * The executor is tool-agnostic and keeps consequential actions behind an approval gate.
 */
export class AutonomousExecutor {
  constructor({ agent, jobs, tools, maxReplans = 2, maxSteps = 12, approvalRequired = true } = {}) {
    this.agent = agent;
    this.jobs = jobs;
    this.tools = tools;
    this.maxReplans = maxReplans;
    this.maxSteps = maxSteps;
    this.approvalRequired = approvalRequired;
  }

  requiresApproval(step = {}) {
    const permissions = new Set(step.permissions || []);
    return permissions.has('destructive') || permissions.has('external-write') || permissions.has('financial');
  }

  checkpoint(job, event) {
    job.trace.push({ at: Date.now(), ...event });
    job.lastEvent = event;
  }

  snapshot(job) {
    return JSON.parse(JSON.stringify({
      id: job.id, goal: job.goal, status: job.status, plan: job.plan,
      trace: job.trace, results: job.results, attempts: job.attempts,
      retries: job.retries, replans: job.replans, verification: job.verification,
      approval: job.approval || null, cancelRequested: Boolean(job.cancelRequested)
    }));
  }

  async execute(job, { executeStep, verify } = {}) {
    if (typeof executeStep !== 'function') throw new Error('Autonomous executor requires executeStep().');
    const state = { usedStrategies: [], replans: 0 };
    const plan = Array.isArray(job.plan) ? job.plan.slice(0, this.maxSteps) : [];
    job.plan = plan;
    let index = 1;

    while (index < job.plan.length - 1) {
      if (job.cancelRequested) return this.snapshot(job);
      const step = job.plan[index];
      const alreadyApproved = job.approval?.approved && job.approval?.step === step.id;
      if (this.approvalRequired && this.requiresApproval(step) && !alreadyApproved) {
        job.status = 'awaiting_approval';
        job.approval = { step: step.id, requestedAt: new Date().toISOString(), approved: false };
        this.checkpoint(job, { id: step.id, label: step.label, tool: step.tool, status: 'approval_required', detail: 'Human approval required before consequential action.' });
        return this.snapshot(job);
      }

      let attempt = 0;
      let completed = false;
      while (!completed) {
        if (job.cancelRequested) return this.snapshot(job);
        attempt += 1;
        job.attempts += 1;
        this.checkpoint(job, { id: step.id, label: step.label, tool: step.tool, status: 'running', attempt });
        try {
          const outcome = await executeStep(step);
          job.results.push({ step: step.id, ok: true, skipped: Boolean(outcome?.skipped), degraded: Boolean(outcome?.degraded), attempt, output: outcome?.output?.output ?? outcome?.output ?? null });
          this.checkpoint(job, { id: step.id, label: step.label, tool: step.tool, status: outcome?.skipped ? 'skipped' : 'done', attempt, detail: outcome?.note || (outcome?.degraded ? 'Recovered with a bounded alternative.' : 'Step completed.'), recovered: Boolean(outcome?.degraded) });
          completed = true;
        } catch (error) {
          const category = this.agent.classifyFailure(error);
          this.checkpoint(job, { id: step.id, label: step.label, tool: step.tool, status: 'failure', attempt, detail: `${category}: ${error.message}`, category });
          if (this.agent.shouldRetry(attempt, category)) {
            job.retries += 1;
            const delay = this.agent.backoffMs(attempt);
            this.checkpoint(job, { id: step.id, label: step.label, tool: step.tool, status: 'retry', attempt, detail: `Retry scheduled after ${delay}ms.`, category, delayMs: delay });
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          const replanned = this.agent.replan(job.plan, step, error, state);
          if (replanned) {
            state.replans += 1;
            state.usedStrategies.push(replanned.strategy);
            job.replans = state.replans;
            job.plan = replanned.plan.slice(0, this.maxSteps);
            this.checkpoint(job, { id: step.id, label: step.label, tool: step.tool, status: 'replan', attempt, detail: `Selected ${replanned.strategy}.`, category, strategy: replanned.strategy });
            attempt = 0;
            continue;
          }
          job.results.push({ step: step.id, ok: false, attempt, error: error.message, category });
          this.checkpoint(job, { id: step.id, label: step.label, tool: step.tool, status: 'failed', attempt, detail: error.message, category });
          throw error;
        }
      }
      index += 1;
    }

    if (job.cancelRequested) return this.snapshot(job);
    const verifier = verify || ((p, r) => this.agent.verifyResults(p, r));
    const verification = verifier(job.plan, job.results);
    job.verification = verification;
    const verifyStep = job.plan[job.plan.length - 1] || { id: 'verify', label: 'Verify outputs', tool: 'verification' };
    if (verification.passed) {
      this.checkpoint(job, { id: verifyStep.id, label: verifyStep.label, tool: verifyStep.tool, status: 'done', detail: `Verification passed: ${verification.completed}/${verification.required}.`, verification });
      return this.snapshot(job);
    }

    this.checkpoint(job, { id: verifyStep.id, label: verifyStep.label, tool: verifyStep.tool, status: 'failed', detail: `Verification failed: ${verification.missing.join(', ') || 'required output missing'}.`, verification });
    if (state.replans >= this.maxReplans) throw new Error(`Verification failed; recovery limit reached (${verification.missing.join(', ') || 'required output missing'}).`);
    const recovery = this.agent.replan(job.plan, { ...verifyStep, id: 'verification-recovery', tool: 'assist' }, new Error(`verification failed: ${verification.missing.join(', ')}`), state);
    if (!recovery) throw new Error(`Verification failed; no safe recovery strategy available.`);
    state.replans += 1;
    job.replans = state.replans;
    job.plan = recovery.plan.slice(0, this.maxSteps);
    this.checkpoint(job, { id: verifyStep.id, label: verifyStep.label, tool: verifyStep.tool, status: 'replan', detail: `Verification triggered ${recovery.strategy}.`, strategy: recovery.strategy });
    return this.execute(job, { executeStep, verify });
  }
}
