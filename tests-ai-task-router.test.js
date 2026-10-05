import assert from 'node:assert/strict';
import { classifyTask, rankByTask } from './core/ai-task-router.js';

assert.equal(classifyTask({ messages: [{ role: 'user', content: 'Debug this JavaScript API function' }] }), 'coding');
assert.equal(classifyTask({ messages: [{ role: 'user', content: 'Analyze this image' }], needsVision: true }), 'vision');
assert.equal(classifyTask({ messages: [{ role: 'user', content: 'Find current research and cite sources' }] }), 'research');
assert.equal(classifyTask({ messages: [{ role: 'user', content: 'Write me a short futuristic story' }] }), 'creative');

const providers = [
  { id: 'general', free: true, capabilities: { vision: false }, strengths: ['general'] },
  { id: 'code', free: true, capabilities: { vision: false }, strengths: ['general', 'coding', 'reasoning'] },
  { id: 'vision', free: true, capabilities: { vision: true }, strengths: ['general', 'vision'] }
];
assert.equal(rankByTask(providers, 'coding')[0].id, 'code');
assert.equal(rankByTask(providers, 'vision')[0].id, 'vision');
console.log('NOVA AI task router tests PASS');
