import assert from 'node:assert/strict';
import { NovaUniversal } from './core/nova-universal.js';
import { ActionGateway } from './core/action-gateway.js';

const mem=new Map();
const store={
 async getProfile(id){return mem.get(id)||null},
 async saveProfile(id,p){mem.set(id,p);return p},
 async audit(e){return e}
};
const universal=new NovaUniversal({store});
const profile=await universal.updateProfile('u1',{accessibility:{largeText:true,voiceFirst:true}});
assert.equal(profile.accessibility.largeText,true);
assert.equal((await universal.getProfile('u1')).accessibility.voiceFirst,true);
assert.equal(universal.checkAction('send',{external:true}).requiresConfirmation,true);
assert.equal(universal.checkAction('summarize').requiresConfirmation,false);
assert.equal(universal.capabilities({mobile:true}).mobileAssistant,true);
const gateway=new ActionGateway({audit:async()=>{}});
const plan=gateway.prepare({action:'send',target:'message',userId:'u1'});
assert.equal(plan.requiresConfirmation,true);
assert.equal((await gateway.confirm(plan,{userId:'u1',confirmed:false})).status,'confirmation-required');
assert.equal((await gateway.confirm(plan,{userId:'u1',confirmed:true})).status,'approved');
console.log('NOVA universal assistant tests PASS');
