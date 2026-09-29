import { promises as fs } from 'node:fs';
import { WorkspaceManager } from './core/workspace-manager.js';
import { BuilderEngine } from './core/builder-engine.js';

const root = '/tmp/nova-v14-builder-test';
await fs.rm(root,{recursive:true,force:true});
const workspace = new WorkspaceManager({root});
await workspace.init();
const builder = new BuilderEngine({workspace});
const ws = await workspace.create('test-project');
await workspace.write(ws.id,'src/app.js','export const value = 42;\n');
const info = await builder.inspect(ws.id);
if(info.fileCount !== 1) throw new Error('inspect failed');
const test1 = await builder.test(ws.id);
if(!test1.ok) throw new Error('initial syntax test failed');
await workspace.patch(ws.id,'src/app.js','42','43');
if((await workspace.read(ws.id,'src/app.js')).includes('43') === false) throw new Error('patch failed');
let blocked=false; try { await workspace.read(ws.id,'../escape.txt'); } catch { blocked=true; }
if(!blocked) throw new Error('path traversal was not blocked');
await workspace.write(ws.id,'src/broken.js','const x = ;\n');
const test2 = await builder.test(ws.id);
if(test2.ok) throw new Error('broken syntax was not detected');
const artifact = await workspace.package(ws.id);
await fs.access(artifact.path);
console.log('NOVA v14 builder tests PASS');
