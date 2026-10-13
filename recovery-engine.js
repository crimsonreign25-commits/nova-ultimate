/**
 * NOVA Adaptive Recovery Engine
 * Deterministic recovery policy for autonomous jobs.
 * It classifies failures, bounds retries, chooses a safe alternative strategy,
 * and prevents circular replanning.
 */

const TRANSIENT_PATTERNS = /timeout|timed out|temporar|rate limit|429|502|503|504|network|fetch failed|socket|eai_again|connection reset|unavailable/i;
const INPUT_PATTERNS = /invalid|required|malformed|unsupported input|bad request|cannot parse/i;
const PERMISSION_PATTERNS = /permission|forbidden|unauthori[sz]ed|access denied|approval required/i;
const VERIFICATION_PATTERNS = /verification|verify|incomplete|mismatch|did not accept/i;

export class RecoveryEngine {
  constructor({ maxAttempts = 3, maxReplans = 2, baseDelayMs = 250, maxDelayMs = 4000 } = {}) {
    this.maxAttempts = Math.max(1, maxAttempts);
    this.maxReplans = Math.max(0, maxReplans);
    this.baseDelayMs = Math.max(0, baseDelayMs);
    this.maxDelayMs = Math.max(this.baseDelayMs, maxDelayMs);
  }

  classify(error) {
    const message = String(error?.message || error || 'Unknown failure');
    if (VERIFICATION_PATTERNS.test(message)) return 'verification';
    if (PERMISSION_PATTERNS.test(message)) return 'permission';
    if (INPUT_PATTERNS.test(message)) return 'input';
    if (TRANSIENT_PATTERNS.test(message)) return 'transient';
    return 'tool';
  }

  shouldRetry(attempt, category) {
    if (category === 'permission' || category === 'input') return false;
    return attempt < this.maxAttempts;
  }

  backoffMs(attempt) {
    const exponential = this.baseDelayMs * (2 ** Math.max(0, attempt - 1));
    return Math.min(this.maxDelayMs, exponential);
  }

  async wait(attempt, sleeper = setTimeout) {
    const delay = this.backoffMs(attempt);
    if (delay <= 0) return delay;
    await new Promise(resolve => sleeper(resolve, delay));
    return delay;
  }

  chooseAlternative(step, category, usedStrategies = []) {
    const used = new Set(usedStrategies);
    const candidates = {
      research: ['assist:knowledge-fallback'],
      security: ['assist:risk-review'],
      analyze: ['assist:structured-review'],
      build: ['assist:solution-plan'],
      assist: ['assist:retry', 'assist:structured-fallback']
    }[step.tool] || ['assist:structured-fallback'];
    return candidates.find(strategy => !used.has(strategy)) || null;
  }

  replan(plan, failedStep, failure, state = {}) {
    const category = this.classify(failure);
    const used = state.usedStrategies || [];
    const alternative = this.chooseAlternative(failedStep, category, used);
    if (!alternative || (state.replans || 0) >= this.maxReplans) return null;
    const [tool, strategy] = alternative.split(':');
    const next = plan.map(step => ({ ...step }));
    const index = next.findIndex(step => step.id === failedStep.id);
    if (index < 0) return null;
    next[index] = {
      ...next[index],
      tool,
      recovery: {
        strategy,
        category,
        reason: String(failure?.message || failure),
        fromTool: failedStep.tool
      }
    };
    return { plan: next, strategy: alternative, category };
  }

  verifyResults(plan, results) {
    const required = plan.filter(step => !['interpret', 'verify'].includes(step.id));
    const byStep = new Map(results.map(result => [result.step, result]));
    const missing = required.filter(step => !byStep.get(step.id)?.ok && !byStep.get(step.id)?.skipped).map(step => step.id);
    return { passed: missing.length === 0, required: required.length, completed: required.length - missing.length, missing };
  }
}
