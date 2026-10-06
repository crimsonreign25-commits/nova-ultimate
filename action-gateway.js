import { randomUUID } from 'node:crypto';

const HIGH_RISK = new Set(['message','send','purchase','delete','remove','account-change','device-control','external-action','permission']);

export class ActionGateway {
  constructor({ audit = async()=>{} } = {}) { this.audit = audit; }
  prepare({ action='unknown', target='', details={}, userId='guest' }={}) {
    const normalized=String(action).trim().toLowerCase();
    const risk=HIGH_RISK.has(normalized)||/delete|send|purchase|password|permission|device|account/i.test(normalized) ? 'high' : 'low';
    return { token:randomUUID(), action:normalized||'unknown', target:String(target||''), details, risk, requiresConfirmation:risk==='high', userId, expiresAt:new Date(Date.now()+5*60*1000).toISOString(), status:'prepared' };
  }
  async confirm(plan, { userId='guest', confirmed=false }={}) {
    if(!plan||plan.userId!==userId) throw new Error('Action authorization mismatch.');
    if(new Date(plan.expiresAt).getTime()<Date.now()) throw new Error('Action confirmation expired.');
    if(plan.requiresConfirmation&&!confirmed) return {...plan,status:'confirmation-required'};
    await this.audit({actor:userId,action:'action-confirmed',resource:plan.action,result:'approved',token:plan.token});
    return {...plan,status:'approved'};
  }
}
