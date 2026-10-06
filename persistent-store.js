import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

export class PersistentStore {
  constructor({ root }) { this.root=root; this.files={conversations:join(root,'conversations.json'),access:join(root,'access.json'),audit:join(root,'audit.json'),profiles:join(root,'profiles.json'),notifications:join(root,'notifications.json'),devices:join(root,'devices.json')}; this.locks=new Map(); }
  async init(){ await fs.mkdir(this.root,{recursive:true}); for(const file of Object.values(this.files)){try{await fs.access(file)}catch{await fs.writeFile(file,'[]','utf8');}} }
  async read(kind){const raw=await fs.readFile(this.files[kind],'utf8');try{return JSON.parse(raw)}catch{return []}}
  async write(kind,data){const file=this.files[kind];const tmp=`${file}.${process.pid}.tmp`;await fs.writeFile(tmp,JSON.stringify(data,null,2),'utf8');await fs.rename(tmp,file);return data;}
  async mutate(kind,fn){const prev=this.locks.get(kind)||Promise.resolve();const next=prev.then(async()=>{const data=await this.read(kind);const out=await fn(data);await this.write(kind,out);return out;}).catch(()=>{});this.locks.set(kind,next);return next;}
  async listConversations(userId){const all=await this.read('conversations');return all.filter(x=>x.userId===userId).sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));}
  async getConversation(userId,id){const all=await this.read('conversations');return all.find(x=>x.userId===userId&&x.id===id)||null;}
  async saveConversation(userId,conversation){const now=new Date().toISOString();const item={id:conversation.id||randomUUID(),userId,title:String(conversation.title||'New Chat').slice(0,120),messages:Array.isArray(conversation.messages)?conversation.messages.slice(-200):[],createdAt:conversation.createdAt||now,updatedAt:now};await this.mutate('conversations',all=>{const i=all.findIndex(x=>x.id===item.id&&x.userId===userId);if(i>=0)all[i]=item;else all.push(item);return all.slice(-5000)});return item;}
  async deleteConversation(userId,id){return this.mutate('conversations',all=>all.filter(x=>!(x.userId===userId&&x.id===id)));}
  async addAccessRequest(data){const item={id:randomUUID(),createdAt:new Date().toISOString(),status:'pending',...data};await this.mutate('access',all=>[...all.slice(-999),item]);await this.audit({actor:data.userId||'unknown',action:'access-request',resource:data.resource||'restricted',result:'pending'});return item;}
  async listAccess(){return this.read('access');}
  async decideAccess(id,decision,actor){let found=null;await this.mutate('access',all=>all.map(x=>{if(x.id===id){found={...x,status:decision,decidedAt:new Date().toISOString(),decidedBy:actor};return found}return x}));if(found)await this.audit({actor,action:`access-${decision}`,resource:found.resource,result:decision,requestId:id});return found;}
  async audit(event){await this.mutate('audit',all=>[...all.slice(-4999),{id:randomUUID(),at:new Date().toISOString(),...event}]);}
  async listAudit(){return this.read('audit');}

  async getProfile(userId){const all=await this.read('profiles');return all.find(x=>x.userId===userId)?.profile||null;}
  async saveProfile(userId,profile){const item={userId,profile,updatedAt:new Date().toISOString()};await this.mutate('profiles',all=>{const i=all.findIndex(x=>x.userId===userId);if(i>=0)all[i]=item;else all.push(item);return all.slice(-10000)});return profile;}
  async addNotification(data){const item={id:randomUUID(),createdAt:new Date().toISOString(),read:false,...data};await this.mutate('notifications',all=>[...all.slice(-4999),item]);return item;}
  async listNotifications(userId){const all=await this.read('notifications');return all.filter(x=>x.userId===userId||x.userId==='broadcast').sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));}
  async markNotification(id,userId){return this.mutate('notifications',all=>all.map(x=>x.id===id&&(x.userId===userId||x.userId==='broadcast')?{...x,read:true}:x));}
  async registerDevice(data){const item={id:data.id||randomUUID(),updatedAt:new Date().toISOString(),...data};await this.mutate('devices',all=>{const i=all.findIndex(x=>x.id===item.id);if(i>=0)all[i]=item;else all.push(item);return all.slice(-10000)});return item;}
  async listDevices(userId){const all=await this.read('devices');return all.filter(x=>x.userId===userId);}
}

