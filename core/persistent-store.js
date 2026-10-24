import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { decryptStoreText, encryptStoreFileText, isEncryptedStoreText, storeEncryptionStatus } from './secure-store-crypto.js';

export class PersistentStore {
  constructor({ root }) {
    this.root = root;
    this.files = {
      conversations: join(root, 'conversations.json'),
      access: join(root, 'access.json'),
      audit: join(root, 'audit.json'),
      profiles: join(root, 'profiles.json'),
      notifications: join(root, 'notifications.json'),
      devices: join(root, 'devices.json'),
      knowledge: join(root, 'knowledge.json'),
      lessons: join(root, 'lessons.json'),
      feedback: join(root, 'feedback.json'),
      evolutionExperiences: join(root, 'evolution-experiences.json'),
      evolutionFeedback: join(root, 'evolution-feedback.json'),
      evolutionEvaluations: join(root, 'evolution-evaluations.json'),
      evolutionProposals: join(root, 'evolution-proposals.json')
    };
    this.locks = new Map();
  }

  async init() {
    const encryption = storeEncryptionStatus();
    if (!encryption.valid) throw new Error(encryption.error);
    if (process.env.NODE_ENV === 'production' && !encryption.enabled) {
      throw new Error('Secure production startup blocked: configure NOVA_DATA_ENCRYPTION_KEY with a randomly generated 32-byte key encoded as 64 hex characters.');
    }
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
    for (const file of Object.values(this.files)) {
      try {
        const raw = await fs.readFile(file, 'utf8');
        const decoded = decryptStoreText(raw);
        JSON.parse(decoded.text);
        if (encryption.enabled && !decoded.encrypted) await this.writeRaw(file, decoded.text);
      } catch (error) {
        if (error.code === 'ENOENT') await this.writeRaw(file, '[]');
        else throw new Error(`NOVA secure store could not initialize ${file}: ${error.message}`);
      }
    }
  }

  async writeRaw(file, text) {
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, encryptStoreFileText(text), { encoding: 'utf8', mode: 0o600 });
    await fs.rename(tmp, file);
  }

  async read(kind) {
    const raw = await fs.readFile(this.files[kind], 'utf8');
    const decoded = decryptStoreText(raw);
    return JSON.parse(decoded.text);
  }

  async write(kind, data) {
    await this.writeRaw(this.files[kind], JSON.stringify(data, null, 2));
    return data;
  }

  encryptionStatus() {
    return storeEncryptionStatus();
  }

  async mutate(kind, fn) {
    const prev = this.locks.get(kind) || Promise.resolve();
    const next = prev.then(async () => {
      const data = await this.read(kind);
      const out = await fn(data);
      await this.write(kind, out);
      return out;
    }).catch(() => {});
    this.locks.set(kind, next);
    return next;
  }

  async listConversations(userId) {
    const all = await this.read('conversations');
    return all.filter(x => x.userId === userId).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  async getConversation(userId, id) {
    const all = await this.read('conversations');
    return all.find(x => x.userId === userId && x.id === id) || null;
  }

  async saveConversation(userId, conversation) {
    const now = new Date().toISOString();
    const item = {
      id: conversation.id || randomUUID(),
      userId,
      title: String(conversation.title || 'New Chat').slice(0, 120),
      messages: Array.isArray(conversation.messages) ? conversation.messages.slice(-200) : [],
      createdAt: conversation.createdAt || now,
      updatedAt: now
    };
    await this.mutate('conversations', all => {
      const i = all.findIndex(x => x.id === item.id && x.userId === userId);
      if (i >= 0) all[i] = item;
      else all.push(item);
      return all.slice(-5000);
    });
    return item;
  }

  async deleteConversation(userId, id) {
    return this.mutate('conversations', all => all.filter(x => !(x.userId === userId && x.id === id)));
  }

  async addAccessRequest(data) {
    const item = { id: randomUUID(), createdAt: new Date().toISOString(), status: 'pending', ...data };
    await this.mutate('access', all => [...all.slice(-999), item]);
    await this.audit({ actor: data.userId || 'unknown', action: 'access-request', resource: data.resource || 'restricted', result: 'pending' });
    return item;
  }

  async listAccess() { return this.read('access'); }

  async decideAccess(id, decision, actor) {
    let found = null;
    await this.mutate('access', all => all.map(x => {
      if (x.id === id) {
        found = { ...x, status: decision, decidedAt: new Date().toISOString(), decidedBy: actor };
        return found;
      }
      return x;
    }));
    if (found) await this.audit({ actor, action: `access-${decision}`, resource: found.resource, result: decision, requestId: id });
    return found;
  }

  async audit(event) {
    await this.mutate('audit', all => [...all.slice(-4999), { id: randomUUID(), at: new Date().toISOString(), ...event }]);
  }

  async listAudit() { return this.read('audit'); }

  async getProfile(userId) {
    const all = await this.read('profiles');
    return all.find(x => x.userId === userId)?.profile || null;
  }

  async saveProfile(userId, profile) {
    const item = { userId, profile, updatedAt: new Date().toISOString() };
    await this.mutate('profiles', all => {
      const i = all.findIndex(x => x.userId === userId);
      if (i >= 0) all[i] = item;
      else all.push(item);
      return all.slice(-10000);
    });
    return profile;
  }

  async addNotification(data) {
    const item = { id: randomUUID(), createdAt: new Date().toISOString(), read: false, ...data };
    await this.mutate('notifications', all => [...all.slice(-4999), item]);
    return item;
  }

  async listNotifications(userId) {
    const all = await this.read('notifications');
    return all.filter(x => x.userId === userId || x.userId === 'broadcast').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async markNotification(id, userId) {
    return this.mutate('notifications', all => all.map(x => x.id === id && (x.userId === userId || x.userId === 'broadcast') ? { ...x, read: true } : x));
  }

  async registerDevice(data) {
    const item = { id: data.id || randomUUID(), updatedAt: new Date().toISOString(), ...data };
    await this.mutate('devices', all => {
      const i = all.findIndex(x => x.id === item.id);
      if (i >= 0) all[i] = item;
      else all.push(item);
      return all.slice(-10000);
    });
    return item;
  }

  async listDevices(userId) {
    const all = await this.read('devices');
    return all.filter(x => x.userId === userId);
  }

  // Tenant-isolated Project Knowledge
  async saveKnowledge(userId, { key, title, content, tags = [], metadata = {} }) {
    const now = new Date().toISOString();
    const item = {
      id: randomUUID(),
      userId,
      key: String(key || randomUUID()).trim().toLowerCase(),
      title: String(title || 'Project Knowledge').slice(0, 150),
      content: String(content || ''),
      tags: Array.isArray(tags) ? tags : [],
      metadata,
      createdAt: now,
      updatedAt: now
    };
    await this.mutate('knowledge', all => {
      const i = all.findIndex(x => x.userId === userId && x.key === item.key);
      if (i >= 0) {
        item.createdAt = all[i].createdAt;
        all[i] = item;
      } else {
        all.push(item);
      }
      return all.slice(-2000);
    });
    return item;
  }

  async listKnowledge(userId) {
    const all = await this.read('knowledge');
    return all.filter(x => x.userId === userId).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  async deleteKnowledge(userId, key) {
    return this.mutate('knowledge', all => all.filter(x => !(x.userId === userId && x.key === String(key).trim().toLowerCase())));
  }

  // Versioned Reusable Lessons & Memory Review
  async saveLesson(userId, { category = 'task', goal, failurePattern, lesson, version = 1 }) {
    const now = new Date().toISOString();
    const item = {
      id: randomUUID(),
      userId,
      category: String(category).toLowerCase(),
      goal: String(goal || '').slice(0, 250),
      failurePattern: String(failurePattern || '').slice(0, 500),
      lesson: String(lesson || '').slice(0, 1000),
      version: Number(version) || 1,
      type: 'saved_memory_lesson', // Clarifies this is saved configuration/memory, not model weight retraining
      createdAt: now,
      updatedAt: now
    };
    await this.mutate('lessons', all => {
      const i = all.findIndex(x => x.userId === userId && x.category === item.category && x.goal === item.goal);
      if (i >= 0) {
        item.version = (all[i].version || 1) + 1;
        item.createdAt = all[i].createdAt;
        all[i] = item;
      } else {
        all.push(item);
      }
      return all.slice(-1000);
    });
    return item;
  }

  async listLessons(userId) {
    const all = await this.read('lessons');
    return all.filter(x => x.userId === userId).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  async deleteLesson(userId, id) {
    return this.mutate('lessons', all => all.filter(x => !(x.userId === userId && x.id === id)));
  }

  // User Feedback and Evaluation Metrics
  async saveFeedback(userId, { taskId, score, comment = '', taskCategory = 'general' }) {
    const item = {
      id: randomUUID(),
      userId,
      taskId: String(taskId || '').slice(0, 100),
      score: Number(score) || 0, // e.g. 1 (thumbs up / success) or -1 (thumbs down / failure)
      comment: String(comment || '').slice(0, 500),
      taskCategory: String(taskCategory).toLowerCase(),
      createdAt: new Date().toISOString()
    };
    await this.mutate('feedback', all => [...all.slice(-4999), item]);
    return item;
  }

  async getMetrics(userId) {
    const allFeedback = await this.read('feedback');
    const userFeedback = userId ? allFeedback.filter(x => x.userId === userId) : allFeedback;
    const total = userFeedback.length;
    const positive = userFeedback.filter(x => x.score > 0).length;
    const negative = userFeedback.filter(x => x.score < 0).length;
    const successRate = total > 0 ? Math.round((positive / total) * 100) : 100;
    const regressionRate = total > 0 ? Math.round((negative / total) * 100) : 0;
    return { totalFeedback: total, positive, negative, successRatePercent: successRate, regressionRatePercent: regressionRate };
  }
}
