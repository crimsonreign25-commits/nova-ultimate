import { promises as fs } from 'node:fs';
import path from 'node:path';
import { BuilderEngine } from './core/builder-engine.js';

const root='/tmp/nova-v15-unit'; await fs.rm(root,{recursive:true,force:true}); await fs.mkdir(root,{recursive:true});
const map=new Map([['src/a.js','export const a = 1;\n']]); await fs.mkdir(path.join(root,'src'),{recursive:true}); await fs.writeFile(path.join(root,'src/a.js'),'export const a = 1;\n');
const workspace={
 workspacePath:()=>root,
 filePath:(_id,rel)=>path.join(root,rel),
 inspect:async()=>[...map.keys()].map(p=>({path:p,size:map.get(p).length,extension:path.extname(p)})),
 read:async(_id,p)=>map.get(p),
 write:async(_id,p,c)=>{map.set(p,c);const fp=path.join(root,p);await fs.mkdir(path.dirname(fp),{recursive:true});await fs.writeFile(fp,c);return {path:p,bytes:Buffer.byteLength(c)}},
 package:async()=>({path:'/tmp/artifact.zip',files:map.size})
};
const b=new BuilderEngine({workspace,maxBuildRounds:3});
const good=await b.autonomousBuild('x',{goal:'multi-file',changes:[{path:'src/a.js',content:'export const a = 2;\n'},{path:'src/b.js',content:'export const b = 3;\n'}]});
if(!good.ok || map.size!==2) throw new Error('good build failed');
const before=map.get('src/a.js');
const bad=await b.autonomousBuild('x',{goal:'bad',changes:[{path:'src/a.js',content:'const = ;\n'}]});
if(bad.ok || !bad.trace.some(x=>x.stage==='rollback') || map.get('src/a.js')!==before) throw new Error('rollback failed');
console.log('NOVA v15 builder unit tests PASS');
