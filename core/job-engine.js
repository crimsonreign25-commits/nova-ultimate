import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export class JobEngine {
  constructor({ maxJobs=100, storePath=path.resolve(process.cwd(),'data','jobs.json') }={}){this.jobs=new Map();this.maxJobs=maxJobs;this.storePath=storePath;this.ready=this.load();}
  async load(){try{const raw=await fs.readFile(this.storePath,'utf8');const arr=JSON.parse(raw);for(const j of Array.isArray(arr)?arr:[])this.jobs.set(j.id,j);}catch{} }
  async persist(){await fs.mkdir(path.dirname(this.storePath),{recursive:true});await fs.writeFile(this.storePath,JSON.stringify([...this.jobs.values()].slice(-this.maxJobs),null,2),'utf8');}
  create(goal,plan){if(this.jobs.size>=this.maxJobs)this.jobs.delete(this.jobs.keys().next().value);const job={id:randomUUID(),goal:String(goal||'').trim(),status:'queued',createdAt:new Date().toISOString(),plan,trace:[],results:[],attempts:0,retries:0,replans:0,cancelRequested:false};this.jobs.set(job.id,job);void this.persist();return job;}
  get(id){return this.jobs.get(id)||null;}
  list(){return[...this.jobs.values()].reverse().map(j=>({id:j.id,goal:j.goal,status:j.status,createdAt:j.createdAt,trace:j.trace.length,retries:j.retries,replans:j.replans,attempts:j.attempts,lastEvent:j.lastEvent||null}));}
  cancel(id){const job=this.get(id);if(!job)return null;if(['completed','failed','cancelled'].includes(job.status))return job;job.cancelRequested=true;if(job.status==='queued')job.status='cancelled';void this.persist();return job;}
  async run(id,executor){await this.ready;const job=this.get(id);if(!job)throw new Error('Job not found.');if(job.status==='running')return job;if(job.cancelRequested){job.status='cancelled';await this.persist();return job;}job.status='running';job.startedAt=new Date().toISOString();await this.persist();try{await executor(job);if(job.cancelRequested)job.status='cancelled';else if(job.status==='running')job.status='completed';}catch(error){job.status=job.cancelRequested?'cancelled':'failed';job.error=error.message;if(!job.cancelRequested)throw error;}finally{job.finishedAt=new Date().toISOString();await this.persist();}return job;}
}
