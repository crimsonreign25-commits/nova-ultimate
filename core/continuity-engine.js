/**
 * NOVA Continuity Engine
 * Manages automatic context window budgeting, history compaction, and task checkpoint recovery.
 */

export class ContinuityEngine {
  constructor(options = {}) {
    this.maxContextTokens = options.maxContextTokens || 8192;
    this.compactionThreshold = options.compactionThreshold || 0.75; // 75% trigger threshold
  }

  estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  shouldCompact(messages) {
    if (!Array.isArray(messages)) return false;
    const totalChars = messages.reduce((acc, m) => acc + (m.content?.length || 0), 0);
    const estimatedTokens = this.estimateTokens(totalChars);
    return estimatedTokens >= (this.maxContextTokens * this.compactionThreshold);
  }

  compactContext(messages) {
    if (!messages || messages.length <= 4) {
      return { summary: '', retained: messages };
    }

    const systemMessages = messages.filter(m => m.role === 'system');
    const recentMessages = messages.slice(-4);
    const middleMessages = messages.slice(0, -4).filter(m => m.role !== 'system');

    const summaryText = middleMessages
      .map(m => `${m.role.toUpperCase()}: ${m.content.substring(0, 150)}...`)
      .join('\n');

    const summaryMessage = {
      role: 'system',
      content: `[NOVA CONTINUITY ENGINE SUMMARY]: Context window auto-compacted:\n${summaryText}`
    };

    return {
      summary: summaryMessage.content,
      retained: [...systemMessages, summaryMessage, ...recentMessages]
    };
  }

  createTaskCheckpoint(taskObj) {
    return {
      taskId: taskObj.taskId || 'task_' + Date.now(),
      objective: taskObj.objective || 'General Assistance',
      status: taskObj.status || 'IN_PROGRESS',
      completedSteps: taskObj.completedSteps || [],
      currentStep: taskObj.currentStep || '',
      remainingSteps: taskObj.remainingSteps || [],
      artifacts: taskObj.artifacts || [],
      updatedAt: new Date().toISOString()
    };
  }
}

export default ContinuityEngine;