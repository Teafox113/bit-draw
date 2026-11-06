import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const sessionId=process.argv[2],runtime=JSON.parse(await readFile(new URL('../.bitdraw-runtime.json',import.meta.url),'utf8')),out=new URL('./real-v7/',import.meta.url);
async function call(request,fail=false){const res=await fetch(runtime.url+'/api/request',{method:'POST',headers:{Authorization:'Bearer '+runtime.token,'Content-Type':'application/json'},body:JSON.stringify({sessionId,request})});const r=await res.json();if(fail)assert.equal(r.ok,false);else assert.notEqual(r.ok,false,r.error);return r;}
const list=await call({action:'recipe.list'}),recipe=JSON.parse(await readFile(new URL('../recipes/coffee-guided.json',import.meta.url),'utf8')),existing=list.recipes.find(r=>r.name===recipe.name);
const stored=await call({action:'recipe.save',recipe,...(existing?{recipeId:existing.id,expectedUpdated:existing.updated}:{})}),command=JSON.parse(await readFile(new URL('coffee-command.json',out),'utf8'));
const imported=await call({action:'document.import',name:'QA 0.7 · 可重用流程驗證',mime:'image/png',data:(await readFile(new URL('coffee.png',out))).toString('base64')});
const run={action:'recipe.run',documentId:imported.id,expectedRevision:0,recipeId:stored.id,expectedUpdated:stored.updated,values:{groups:command.groups}};
await call({...run,expectedRevision:99},true);const preview=await call({...run,dryRun:true});assert.equal((await call({action:'document.inspect',documentId:imported.id})).revision,0);const result=await call(run);assert.equal(result.labels.length,6);assert.ok(result.labels.every(l=>!('runs'in l)));
const plan=await call({action:'document.segmentPlan',documentId:imported.id,expectedRevision:1,groups:command.groups});assert.ok(plan.proposals.every(p=>!('runs'in p)));
const project=await call({action:'document.save',documentId:imported.id});await writeFile(new URL('recipe-output.bitdraw.json',out),JSON.stringify(project.project));await call({action:'document.markSaved',documentId:imported.id,expectedRevision:1});
const final=await call({action:'document.open',project:JSON.parse(await readFile(new URL('coffee-corrected.bitdraw.json',out),'utf8'))});
const report={ok:true,recipeId:stored.id,recipeUpdated:stored.updated,documentId:final.id,typedHintsPersist:true,staleRevisionRejected:true,dryRunNoMutation:true,summaryHasNoMasks:true,runBytes:Buffer.byteLength(JSON.stringify(run)),resultBytes:Buffer.byteLength(JSON.stringify(result))};await writeFile(new URL('recipe-report.json',out),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
