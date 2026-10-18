import { randomUUID } from 'node:crypto';

const HIGH_RISK = new Set(['message','send','purchase','delete','remove','account-change','device-control','external-action','permission']);

/**
 * Consent gate for consequential actions. Prepared plans are held server-side,
 * expire quickly, and can only be confirmed by the same verified account once.
 * This gate approves intent; it does not itself perform arbitrary device actions.
 */
export class ActionGateway {
  constructor({ audit = async()=>{}, now = () => Date.now() } = {}) {
    this.audit = audit;
    this.now = now;
    this.plans = new Map();
  }
  prepare({ action='unknown', target='', details={}, userId='guest' }={}) {
    const normalized=String(action).trim().toLowerCase();
    const safeDetails = details && typeof details === 'object' ? JSON.parse(JSON.stringify(details)) : {};
    const risk=HIGH_RISK.has(normalized)||/delete|send|purchase|password|permission|device|account/i.test(normalized) ? 'high' : 'low';
    const plan = { token:randomUUID(), action:normalized||'unknown', target:String(target||''), details:safeDetails, risk, requiresConfirmation:risk==='high', userId:String(userId), expiresAt:new Date(this.now()+5*60*1000).toISOString(), status:'prepared' };
    this.plans.set(plan.token, plan);
    return { ...plan, details: safeDetails };
  }
  async confirm(plan, { userId='guest', confirmed=false }={}) {
    const token = String(plan?.token || '');
    const stored = this.plans.get(token);
    if(!stored || stored.userId !== String(userId)) throw new Error('Action authorization mismatch or unknown plan.');
    if (stored.action !== plan.action || stored.target !== String(plan.target || '') || stored.expiresAt !== plan.expiresAt) throw new Error('Action plan was modified after preparation.');
    if(new Date(stored.expiresAt).getTime()<this.now()) { this.plans.delete(token); throw new Error('Action confirmation expired.'); }
    if(stored.requiresConfirmation&&!confirmed) return {...stored,status:'confirmation-required'};
    this.plans.delete(token);
    await this.audit({actor:String(userId),action:'action-confirmed',resource:stored.action,result:'approved',token:stored.token});
    return {...stored,status:'approved'};
  }
}
