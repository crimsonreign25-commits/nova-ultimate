import { promises as fs } from 'node:fs';
import { WorkspaceManager } from './core/workspace-manager.js';
import { BuilderEngine } from './core/builder-engine.js';

const root='/tmp/nova-v15-builder-test';
await fs.rm(root,{recursive:true,force:true});
const workspace=new WorkspaceManager({root}); await workspace.init();
const builder=new BuilderEngine({workspace,maxBuildRounds:3});
const ws=await workspace.create('autonomous-project');
await workspace.write(ws.id,'src/a.js','export const a = 1;\n');
const ok=await builder.autonomousBuild(ws.id,{goal:'add b module',changes:[
  {path:'src/a.js',content:'export const a = 2;\n'},
  {path:'src/b.js',content:'export const b = 3;\n'}
]});
if(!ok.ok || ok.artifact.files!==2) throw new Error('multi-file autonomous build failed');
const before=await workspace.read(ws.id,'src/a.js');
const failed=await builder.autonomousBuild(ws.id,{goal:'introduce bad syntax',changes:[{path:'src/a.js',content:'export const a = ;\n'}]});
if(failed.ok || !failed.trace.some(x=>x.stage==='rollback')) throw new Error('failed build did not rollback');
if(await workspace.read(ws.id,'src/a.js')!==before) throw new Error('rollback did not restore workspace');
console.log('NOVA v15 autonomous builder tests PASS');
