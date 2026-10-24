import test from 'node:test';
import assert from 'node:assert/strict';
import { EvolutionEngine } from './core/evolution-engine.js';

function memoryStore() {
  const data = { evolutionExperiences: [], evolutionFeedback: [], evolutionEvaluations: [], evolutionProposals: [] };
  return {
    async read(key) { return structuredClone(data[key]); },
    async mutate(key, fn) { data[key] = fn(structuredClone(data[key])); return structuredClone(data[key]); }
  };
}

test('experience requires explicit opt-in and records evidence status', async () => {
  const engine = new EvolutionEngine({ store: memoryStore() });
  await assert.rejects(engine.recordExperience({ userId: 'u1', optedIn: false, summary: 'test' }), /opt-in/);
  const item = await engine.recordExperience({ userId: 'u1', optedIn: true, taskType: 'coding', outcome: 'success', summary: 'Test passed', verified: true });
  assert.equal(item.evidenceStatus, 'user-marked-verified');
  assert.equal((await engine.listForUser('experiences', 'u1')).length, 1);
  assert.equal((await engine.listForUser('experiences', 'u2')).length, 0);
});

test('feedback validates rating and requires opt-in', async () => {
  const engine = new EvolutionEngine({ store: memoryStore() });
  await assert.rejects(engine.recordFeedback({ userId: 'u', optedIn: true, rating: 6 }), /1 to 5/);
  await assert.rejects(engine.recordFeedback({ userId: 'u', optedIn: false, rating: 5 }), /opt-in/);
  assert.equal((await engine.recordFeedback({ userId: 'u', optedIn: true, rating: 4 })).rating, 4);
});

test('evaluation passes only when all non-empty checks pass', async () => {
  const engine = new EvolutionEngine({ store: memoryStore() });
  await assert.rejects(engine.recordEvaluation({ userId: 'u', checks: [] }), /between 1 and 100/);
  const failed = await engine.recordEvaluation({ userId: 'u', checks: [{ name: 'syntax', ok: true }, { name: 'tests', ok: false }] });
  assert.equal(failed.passed, false);
  const passed = await engine.recordEvaluation({ userId: 'u', checks: [{ name: 'syntax', ok: true }, { name: 'tests', ok: true }] });
  assert.equal(passed.status, 'verified-passing');
});

test('upgrade requires creator decision and passing verification before verified status', async () => {
  const engine = new EvolutionEngine({ store: memoryStore() });
  const proposal = await engine.proposeUpgrade({ userId: 'creator', title: 'Improve planner', rationale: 'Evaluation found repeatable planning errors.', changePlan: 'Add targeted regression tests and improve ranking logic.', rollbackPlan: 'Restore the previous commit if regression tests fail.', risk: 'low' });
  assert.equal(proposal.status, 'proposed');
  const premature = await engine.verifyProposal(proposal.id, { checks: [{ name: 'tests', ok: true }], actor: 'creator' });
  assert.equal(premature.status, 'verification-failed');
  await engine.decideProposal(proposal.id, { decision: 'approved', actor: 'creator' });
  const verified = await engine.verifyProposal(proposal.id, { checks: [{ name: 'tests', ok: true }, { name: 'rollback', ok: true }], actor: 'creator' });
  assert.equal(verified.status, 'verified');
  assert.equal(verified.deployed, false);
});

test('status avoids claiming model retraining or automatic deployment', async () => {
  const engine = new EvolutionEngine({ store: memoryStore() });
  const status = await engine.status();
  assert.equal(status.underlyingModelRetraining, false);
  assert.equal(status.automaticCodeDeployment, false);
  assert.match(status.principle, /Evolve/);
});
