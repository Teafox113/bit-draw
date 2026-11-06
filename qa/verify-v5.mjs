// Integration check for an explicitly selected, disposable test browser session.
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const sessionId=process.argv[2];if(!sessionId)throw Error('Provide the observed test session ID');
const runtime=JSON.parse(await readFile(new URL('../.bitdraw-runtime.json',import.meta.url),'utf8'));
async function request(request,fail=false){const response=await fetch(runtime.url+'/api/request',{method:'POST',headers:{Authorization:'Bearer '+runtime.token,'Content-Type':'application/json'},body:JSON.stringify({sessionId,request})});const result=await response.json();if(fail){assert.equal(result.ok,false);return result;}assert.notEqual(result.ok,false,JSON.stringify(result));return result;}
const before=await request({action:'documents.list'});assert.ok(before.documents.length<6,'Use a fresh QA tab');
const doc=await request({action:'document.create',width:16,height:16,name:'QA v0.5 · 復原與流程'}),documentId=doc.id;
const recipe=await request({action:'recipe.save',recipe:{format:'bitdraw-recipe',version:1,name:'QA · 兩層角色色塊',parameters:{body:{type:'color',default:'#79b4a9'}},commands:[{op:'paint.rect',x:4,y:4,width:8,height:10,color:{$param:'body'}},{op:'layer.add',name:'臉與眼睛'},{op:'paint.rect',x:5,y:5,width:6,height:4,color:'#f1bd75'},{op:'paint.rect',x:6,y:6,width:1,height:1,color:'#172c3c'},{op:'paint.rect',x:9,y:6,width:1,height:1,color:'#172c3c'}]}});
const run={action:'recipe.run',documentId,recipeId:recipe.id,expectedUpdated:recipe.updated,expectedRevision:0,values:{body:'#79b4a9'}};
const preview=await request({...run,dryRun:true});assert.equal(preview.changes.pixels,80);assert.equal((await request({action:'document.inspect',documentId})).revision,0);
await request({...run,values:{body:'invalid'}},true);await request(run);const inspect=await request({action:'document.inspect',documentId});assert.equal(inspect.undo,1);assert.equal(inspect.layers.length,2);await request(run,true);
const regions=await request({action:'document.regions',documentId,tolerance:0});assert.equal(regions.total,3);const face=regions.regions.find(r=>r.area===22);assert.ok(face);assert.equal(face.candidates[0].color,'#f1bd75');
const mask=await request({action:'document.regionPreview',documentId,expectedRevision:1,layerId:regions.layerId,regionId:face.id,...regions.settings});await writeFile(new URL('./region-mask-v5.png',import.meta.url),Buffer.from(mask.png,'base64'));
const fill={action:'document.apply',documentId,expectedRevision:1,commands:[{...face.command,color:'#d3e3b0'}]};assert.equal((await request({...fill,dryRun:true})).changes.pixels,22);await request(fill);await request(fill,true);
// Automatic interval, deliberately without backup.flush.
await new Promise(r=>setTimeout(r,2600));const automatic=await request({action:'backup.list'});assert.ok(automatic.backups.some(b=>b.name===doc.name&&b.revision===2));
for(let i=0;i<4;i++){await request({action:'document.apply',documentId,expectedRevision:2+i,commands:[{op:'project.rename',name:`QA v0.5 · 復原版本 ${i+1}`}]});await request({action:'backup.flush'});}
const list=await request({action:'backup.list'}),latest=list.backups.find(b=>b.name==='QA v0.5 · 復原版本 4');assert.ok(latest);assert.equal(list.backups.filter(b=>b.documentKey===latest.documentKey).length,3);
const original=await request({action:'document.save',documentId});await writeFile(new URL('./recovery-v5.bitdraw.json',import.meta.url),JSON.stringify(original.project));await request({action:'document.markSaved',documentId,expectedRevision:original.revision});
const restored=await request({action:'backup.restore',backupId:latest.id}),copy=await request({action:'document.save',documentId:restored.id});assert.deepEqual(copy.project,original.project);assert.equal(restored.undo,0);assert.equal(restored.dirty,true);
const report={ok:true,sessionId,documentId,restoredId:restored.id,backupId:latest.id,recipeId:recipe.id,recipeUpdated:recipe.updated,automaticBackup:true,retainedVersions:3,projectSHA256:createHash('sha256').update(JSON.stringify(copy.project)).digest('hex'),regionCount:regions.total,facePixels:face.area,recipePreviewPixels:preview.changes.pixels};
await writeFile(new URL('./verification-v5.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
