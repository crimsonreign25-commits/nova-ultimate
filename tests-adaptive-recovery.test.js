import assert from 'node:assert/strict';
import { AgentCore } from './core/agent-core.js';
import { JobEngine } from './core/job-engine.js';

const agent = new AgentCore({ maxRetries: 2, recovery: { maxReplans: 2, baseDelayMs: 0 } });

const plan = agent.plan('research the latest AI news and build a website');
assert.equal(plan.at(-1).id, 'verify');
assert.equal(agent.classifyFailure(new Error('provider rejected request')), 'tool');
assert.equal(agent.classifyFailure(new Error('request timeout')), 'transient');
assert.equal(agent.classifyFailure(new Error('invalid URL')), 'input');
assert.equal(agent.classifyFailure(new Error('permission denied')), 'permission');
assert.equal(agent.classifyFailure(new Error('verification failed')), 'verification');
assert.equal(agent.shouldRetry(1, 'transient'), true);
assert.equal(agent.shouldRetry(2, 'transient'), true);
assert.equal(agent.shouldRetry(3, 'transient'), false);
assert.equal(agent.shouldRetry(1, 'permission'), false);
const replanned = agent.replan(plan, plan.find(s => s.id === 'research'), new Error('provider rejected request'), { replans:0, usedStrategies:[] });
assert.ok(replanned);
assert.notEqual(replanned.plan.find(s => s.id === 'research').tool, 'research');
assert.equal(agent.replan(plan, plan.find(s => s.id === 'research'), new Error('provider rejected request'), { replans:2, usedStrategies:[] }), null);
const verification = agent.verifyResults(plan, [{step:'research',ok:true},{step:'build',ok:true}]);
assert.equal(verification.passed, true);

const jobs = new JobEngine({ maxJobs: 3 });
const job = jobs.create('self test', plan);
await jobs.run(job.id, async current => { current.results.push({step:'research',ok:true}); });
assert.equal(job.status, 'completed');
const cancellable = jobs.create('cancel test', plan);
jobs.cancel(cancellable.id);
await jobs.run(cancellable.id, async () => { throw new Error('should not execute'); });
assert.equal(cancellable.status, 'cancelled');

console.log('adaptive-recovery tests: PASS');
