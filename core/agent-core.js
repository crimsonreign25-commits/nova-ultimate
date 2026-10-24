import { randomUUID } from 'node:crypto';
import { RecoveryEngine } from './recovery-engine.js';

const rules = [
  { id: 'research', label: 'Gather live web intelligence', tool: 'research', category: 'research', test: /research|search|latest|news|compare|investigate|find out|sources/i },
  { id: 'security', label: 'Inspect target security', tool: 'security', category: 'debugging', test: /https?:\/\/|url|security|scan|safe|risk|phishing|malware/i },
  { id: 'analyze', label: 'Analyze provided context', tool: 'analyze', category: 'document_work', test: /analy[sz]|document|file|image|pdf|spreadsheet|data/i },
  { id: 'build', label: 'Design and build solution', tool: 'assist', category: 'software_engineering', test: /build|code|create|develop|design|implement|write|solution|app|website|prototype/i }
];

export class AgentCore {
  constructor({ maxSteps = 10, maxRetries = 2, recovery = {} } = {}) {
    this.maxSteps = maxSteps;
    this.recovery = new RecoveryEngine({ maxAttempts: maxRetries + 1, ...recovery });
    this.maxRetries = maxRetries;
  }

  interpretGoal(goal, { attachments = [] } = {}) {
    const task = String(goal || '').trim();
    const ambiguities = [];
    const assumptions = [];
    const keywords = [];

    if (!task) {
      ambiguities.push('Goal text is empty.');
    } else {
      if (task.length < 15) {
        ambiguities.push('Goal description is brief and may lack details.');
        assumptions.push('Default to safe, standard solution boundaries.');
      }
      if (/https?:\/\/[^\s]+/i.test(task) && !/scan|check|security|inspect/i.test(task)) {
        ambiguities.push('URL included without explicit operation.');
        assumptions.push('Analyze URL safety and context.');
      }
      if (attachments.length && !/file|doc|pdf|attachment|image/i.test(task)) {
        assumptions.push('Attachments present; extract and incorporate context.');
      }
    }

    const hasResearch = /research|search|latest|news|compare|investigate|find out|sources/i.test(task);
    const hasSecurity = /https?:\/\/|url|security|scan|safe|risk|phishing|malware/i.test(task);
    const hasBuild = /build|code|create|develop|design|implement|write|solution|app|website|prototype/i.test(task);
    const hasAnalyze = attachments.length > 0 || /analy[sz]|document|file|image|pdf|spreadsheet|data/i.test(task);

    const primaryCategory = hasBuild ? 'software_engineering'
      : hasSecurity ? 'debugging'
      : hasResearch ? 'research'
      : hasAnalyze ? 'document_work'
      : 'project_management';

    const criteria = [
      'Goal objective satisfied with verifiable output',
      'No unhandled tool execution failures',
      'Context and constraints respected without hallucinated details'
    ];
    if (hasBuild) criteria.push('Generated artifacts pass safe syntax and structural verification');
    if (hasSecurity) criteria.push('Target security profile evaluated with explicit risk status');

    return {
      task,
      primaryCategory,
      ambiguities,
      assumptions,
      resolvedAmbiguity: ambiguities.length === 0,
      measurableCriteria: criteria,
      hasAttachments: attachments.length > 0
    };
  }

  plan(goal, { attachments = [] } = {}) {
    const interpretation = this.interpretGoal(goal, { attachments });
    const task = interpretation.task;
    if (!task) return [];

    const steps = [
      {
        id: 'interpret',
        label: 'Interpret objective and resolve ambiguity',
        tool: 'reasoning',
        category: 'project_management',
        dependsOn: [],
        successCriteria: 'Objective parsed, ambiguity noted, and measurable targets established.',
        ambiguities: interpretation.ambiguities,
        assumptions: interpretation.assumptions
      }
    ];

    for (const rule of rules) {
      if (rule.test.test(task)) {
        steps.push({
          id: rule.id,
          label: rule.label,
          tool: rule.tool,
          category: rule.category,
          dependsOn: ['interpret'],
          successCriteria: `${rule.label} completed without errors.`
        });
      }
    }

    if (attachments.length && !steps.some(s => s.id === 'analyze')) {
      steps.push({
        id: 'analyze',
        label: 'Analyze provided context and attachments',
        tool: 'analyze',
        category: 'document_work',
        dependsOn: ['interpret'],
        successCriteria: 'Attachment content extracted and analyzed.'
      });
    }

    if (steps.length === 1) {
      steps.push({
        id: 'assist',
        label: 'Work through objective systematically',
        tool: 'assist',
        category: interpretation.primaryCategory,
        dependsOn: ['interpret'],
        successCriteria: 'Core objective addressed systematically.'
      });
    }

    const workIds = steps.slice(1).map(s => s.id);
    steps.push({
      id: 'verify',
      label: 'Verify outputs and assemble result',
      tool: 'verification',
      category: 'project_management',
      dependsOn: workIds,
      successCriteria: 'All dependencies completed and measurable criteria satisfied.'
    });

    // Validate dependency graph ordering
    const finalSteps = steps.slice(0, this.maxSteps);
    this.validateDependencyGraph(finalSteps);
    return finalSteps;
  }

  validateDependencyGraph(steps) {
    const stepIds = new Set(steps.map(s => s.id));
    for (const step of steps) {
      step.dependsOn = (step.dependsOn || []).filter(dep => stepIds.has(dep));
    }
  }

  createJob(goal, options = {}) {
    const interpretation = this.interpretGoal(goal, options);
    return {
      id: randomUUID(),
      goal: String(goal || '').trim(),
      status: 'planned',
      createdAt: new Date().toISOString(),
      retries: 0,
      replans: 0,
      attempts: 0,
      interpretation,
      plan: this.plan(goal, options)
    };
  }

  shouldRetry(attempt, category = 'tool') { return this.recovery.shouldRetry(attempt, category); }
  classifyFailure(error) { return this.recovery.classify(error); }
  backoffMs(attempt) { return this.recovery.backoffMs(attempt); }
  replan(plan, failedStep, failure, state) { return this.recovery.replan(plan, failedStep, failure, state); }
  verifyResults(plan, results) { return this.recovery.verifyResults(plan, results); }
}
