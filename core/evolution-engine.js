import { randomUUID } from 'node:crypto';

const MAX_TEXT = 4000;
const cleanText = (value, max = MAX_TEXT) => String(value ?? '').trim().slice(0, max);
const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Evidence-led evolution layer. It records user-approved experiences and
 * evaluation evidence; it does not train or mutate the underlying model.
 * Proposed software changes remain proposals until a creator approves them.
 */
export class EvolutionEngine {
  constructor({ store, now = () => new Date().toISOString() } = {}) {
    if (!store) throw new TypeError('EvolutionEngine requires a persistent store.');
    this.store = store;
    this.now = now;
  }

  async status() {
    const [experiences, feedback, evaluations, proposals] = await Promise.all([
      this.store.read('evolutionExperiences'), this.store.read('evolutionFeedback'),
      this.store.read('evolutionEvaluations'), this.store.read('evolutionProposals')
    ]);
    return {
      engine: 'NOVA Evolution Engine',
      state: 'operational',
      principle: 'Understand → Learn → Evolve → Adapt → Verify → Improve',
      counts: {
        optedInExperiences: experiences.length,
        feedbackRecords: feedback.length,
        evaluations: evaluations.length,
        proposals: proposals.length,
        verifiedEvaluations: evaluations.filter(x => x.passed).length,
        approvedProposals: proposals.filter(x => x.status === 'approved').length,
        verifiedProposals: proposals.filter(x => x.status === 'verified').length
      },
      underlyingModelRetraining: false,
      automaticCodeDeployment: false,
      safety: ['Experience capture requires explicit opt-in.', 'Proposals do not modify production code.', 'Verification requires non-empty checks and every check to pass.', 'Approval and deployment are separate actions.'],
      lastActivityAt: [...experiences, ...feedback, ...evaluations, ...proposals].map(x => x.createdAt || x.updatedAt).filter(Boolean).sort().at(-1) || null
    };
  }

  async recordExperience({ userId, optedIn, taskType, outcome, summary, verified = false, source = 'user' } = {}) {
    if (!userId) throw new Error('userId is required.');
    if (optedIn !== true) throw new Error('Explicit opt-in is required before storing an experience.');
    const safeOutcome = ['success', 'partial', 'failure', 'unknown'].includes(outcome) ? outcome : 'unknown';
    const item = {
      id: randomUUID(), userId: cleanText(userId, 160), taskType: cleanText(taskType, 120) || 'general',
      outcome: safeOutcome, summary: cleanText(summary), verified: Boolean(verified),
      source: cleanText(source, 40) || 'user', createdAt: this.now(),
      evidenceStatus: verified ? 'user-marked-verified' : 'unverified'
    };
    await this.store.mutate('evolutionExperiences', all => [...all.slice(-4999), item]);
    return item;
  }

  async recordFeedback({ userId, optedIn, experienceId = null, rating, comment = '' } = {}) {
    if (!userId) throw new Error('userId is required.');
    if (optedIn !== true) throw new Error('Explicit opt-in is required before storing feedback.');
    const score = Number(rating);
    if (!Number.isInteger(score) || score < 1 || score > 5) throw new Error('rating must be an integer from 1 to 5.');
    const item = { id: randomUUID(), userId: cleanText(userId, 160), experienceId: cleanText(experienceId, 160) || null, rating: score, comment: cleanText(comment, 1000), createdAt: this.now() };
    await this.store.mutate('evolutionFeedback', all => [...all.slice(-4999), item]);
    return item;
  }

  async recordEvaluation({ userId, name, checks, metrics = {} } = {}) {
    if (!userId) throw new Error('userId is required.');
    if (!Array.isArray(checks) || checks.length < 1 || checks.length > 100) throw new Error('Provide between 1 and 100 verification checks.');
    const normalized = checks.map((check, i) => ({
      name: cleanText(isPlainObject(check) ? check.name : `check-${i + 1}`, 160) || `check-${i + 1}`,
      ok: Boolean(isPlainObject(check) && check.ok),
      evidence: cleanText(isPlainObject(check) ? check.evidence : '', 500)
    }));
    const safeMetrics = {};
    if (isPlainObject(metrics)) for (const [key, value] of Object.entries(metrics).slice(0, 30)) {
      if (/^[a-zA-Z0-9_.-]{1,80}$/.test(key) && (typeof value === 'number' && Number.isFinite(value) || typeof value === 'string' || typeof value === 'boolean')) safeMetrics[key] = value;
    }
    const passed = normalized.length > 0 && normalized.every(x => x.ok);
    const item = { id: randomUUID(), userId: cleanText(userId, 160), name: cleanText(name, 160) || 'NOVA evaluation', checks: normalized, metrics: safeMetrics, passed, createdAt: this.now(), status: passed ? 'verified-passing' : 'failed-or-incomplete' };
    await this.store.mutate('evolutionEvaluations', all => [...all.slice(-4999), item]);
    return item;
  }

  async listForUser(kind, userId) {
    const map = { experiences: 'evolutionExperiences', feedback: 'evolutionFeedback', evaluations: 'evolutionEvaluations' };
    if (!map[kind]) throw new Error('Unknown evolution record type.');
    const items = await this.store.read(map[kind]);
    return items.filter(x => x.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200);
  }

  async proposeUpgrade({ userId, title, rationale, changePlan, risk = 'medium', rollbackPlan } = {}) {
    if (!userId) throw new Error('userId is required.');
    if (cleanText(title, 200).length < 4 || cleanText(rationale).length < 10 || cleanText(changePlan).length < 10 || cleanText(rollbackPlan).length < 5) {
      throw new Error('Provide a title, rationale, change plan, and rollback plan with sufficient detail.');
    }
    const item = { id: randomUUID(), createdBy: cleanText(userId, 160), title: cleanText(title, 200), rationale: cleanText(rationale), changePlan: cleanText(changePlan), rollbackPlan: cleanText(rollbackPlan), risk: ['low', 'medium', 'high'].includes(risk) ? risk : 'medium', status: 'proposed', createdAt: this.now(), updatedAt: this.now(), approval: null, verification: null, deployed: false };
    await this.store.mutate('evolutionProposals', all => [...all.slice(-1999), item]);
    return item;
  }

  async listProposals() {
    return (await this.store.read('evolutionProposals')).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200);
  }

  async decideProposal(id, { decision, actor } = {}) {
    if (!['approved', 'rejected'].includes(decision)) throw new Error('decision must be approved or rejected.');
    let found = null;
    await this.store.mutate('evolutionProposals', all => all.map(item => {
      if (item.id !== id) return item;
      found = { ...item, status: decision, approval: { actor: cleanText(actor, 160), decision, at: this.now() }, updatedAt: this.now() };
      return found;
    }));
    if (!found) throw new Error('Upgrade proposal not found.');
    return found;
  }

  async verifyProposal(id, { checks, actor } = {}) {
    if (!Array.isArray(checks) || checks.length < 1 || checks.length > 100) throw new Error('Provide at least one verification check.');
    let found = null;
    const normalized = checks.map((c, i) => ({ name: cleanText(isPlainObject(c) ? c.name : `check-${i + 1}`, 160) || `check-${i + 1}`, ok: Boolean(isPlainObject(c) && c.ok), evidence: cleanText(isPlainObject(c) ? c.evidence : '', 500) }));
    const passed = normalized.every(c => c.ok);
    await this.store.mutate('evolutionProposals', all => all.map(item => {
      if (item.id !== id) return item;
      found = { ...item, status: passed && item.status === 'approved' ? 'verified' : 'verification-failed', verification: { actor: cleanText(actor, 160), checks: normalized, passed, at: this.now() }, updatedAt: this.now(), deployed: false };
      return found;
    }));
    if (!found) throw new Error('Upgrade proposal not found.');
    return found;
  }
}
