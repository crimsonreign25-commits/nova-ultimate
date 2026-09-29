import assert from 'node:assert/strict';
import { AgentCore } from './core/agent-core.js';
import { JobEngine } from './core/job-engine.js';
import { AutonomousExecutor } from './core/autonomous-executor.js';

const agent = new AgentCore({ maxRetries: 1, recovery: { maxReplans: 2, baseDelayMs: 0 } });
const jobs = new JobEngine({ maxJobs: 5 });
const executor = new AutonomousExecutor({ agent, jobs, maxReplans: 2, maxSteps: 12, approvalRequired: true });
const plan = agent.plan('research and build a website');

assert.equal(plan.at(-1).id, 'verify');
assert.equal(agent.classifyFailure(new Error('timeout')), 'transient');
assert.equal(agent.classifyFailure(new Error('permission denied')), 'permission');
assert.ok(agent.replan(plan, plan.find(x => x.id === 'research'), new Error('provider unavailable'), { replans:0, usedStrategies:[] }));

const job = jobs.create('research and build', plan);
let researchCalls = 0;
await executor.execute(job, {
  executeStep: async step => {
    if (step.id === 'research') {
      researchCalls++;
      if (researchCalls === 1) throw new Error('temporary timeout');
    }
    return { ok:true, output:`done:${step.id}` };
  }
});
assert.equal(job.status, 'queued');
assert.ok(job.trace.some(x => x.status === 'retry'));
assert.ok(job.trace.some(x => x.status === 'done'));

const approvalJob = jobs.create('perform destructive action', [
  {id:'interpret',label:'Interpret',tool:'reasoning',dependsOn:[]},
  {id:'write',label:'Write',tool:'assist',permissions:['destructive'],dependsOn:['interpret']},
  {id:'verify',label:'Verify',tool:'verification',dependsOn:['write']}
]);
const approvalResult = await executor.execute(approvalJob, { executeStep: async () => ({ok:true}) });
assert.equal(approvalResult.status, 'awaiting_approval');
assert.ok(approvalJob.trace.some(x => x.status === 'approval_required'));

const cancelJob = jobs.create('cancel me', plan);
jobs.cancel(cancelJob.id);
const cancelResult = await executor.execute(cancelJob, { executeStep: async () => { throw new Error('must not run'); } });
assert.equal(cancelResult.cancelRequested, true);

console.log('autonomous-v13 tests: PASS');
