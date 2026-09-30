import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PersistentStore } from './core/persistent-store.js';
const root=await mkdtemp(join(tmpdir(),'nova-v21-'));try{
 const s=new PersistentStore({root});await s.init();
 const c=await s.saveConversation('u1',{id:'c1',title:'Test',messages:[{role:'user',text:'hello',at:Date.now()},{role:'nova',text:'hi',at:Date.now()}]});
 assert.equal((await s.listConversations('u1')).length,1);assert.equal((await s.getConversation('u1','c1')).messages.length,2);
 const req=await s.addAccessRequest({userId:'u2',resource:'builder',reason:'inspect'});assert.equal((await s.listAccess()).find(x=>x.id===req.id).status,'pending');
 await s.decideAccess(req.id,'approved','creator');assert.equal((await s.listAccess()).find(x=>x.id===req.id).status,'approved');
 assert.ok((await s.listAudit()).length>=2); console.log('NOVA v21 persistent-store tests: PASS');
}finally{await rm(root,{recursive:true,force:true});}
