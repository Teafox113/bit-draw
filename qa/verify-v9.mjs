import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {unpackProject,legacyProject} from '../dist/project-codec.js';
import {createHash} from 'node:crypto';
const sessionId=process.argv[2],runtime=JSON.parse(await readFile(new URL('../.bitdraw-runtime.json',import.meta.url),'utf8')),dir=new URL('./real-v9/',import.meta.url);await mkdir(dir,{recursive:true});
async function call(request){const t=performance.now(),r=await fetch(runtime.url+'/api/request',{method:'POST',headers:{Authorization:'Bearer '+runtime.token,'Content-Type':'application/json'},body:JSON.stringify({sessionId,request})}),result=await r.json();assert.notEqual(result.ok,false,result.error);return {...result,elapsedMs:Math.round(performance.now()-t)};}
async function png(id,file){const r=await call({action:'document.export',documentId:id,scale:1});await writeFile(new URL(file,dir),Buffer.from(r.png,'base64'));return r;}
const digest=p=>createHash('sha256').update(Uint8Array.from(p)).digest('hex'),reports=[];
console.log(JSON.stringify(await call({action:'documents.list'})));
for(const [name,file,kind,preset]of [['anime','wikipe-tan.png','illustration','illustration'],['photo','nasa-portrait.jpg','photo','photo']]){
 const opened=await call({action:'document.import',name:file,mime:file.endsWith('.jpg')?'image/jpeg':'image/png',data:(await readFile(new URL('./real-v8/'+file,import.meta.url))).toString('base64')}),id=opened.id;let revision=opened.revision;
 const focus=await call({action:'document.focusPreview',documentId:id,expectedRevision:revision,kind});await writeFile(new URL(name+'-detected.png',dir),Buffer.from(focus.png,'base64'));assert.equal(focus.faces.length,1);const {png:omit,...focusInfo}=focus;await writeFile(new URL(name+'-focus.json',dir),JSON.stringify(focusInfo,null,2));
 const plan=await call({action:'document.pixelPlan',documentId:id,width:96,height:74,padding:3,framing:'face',kind,colors:24,preset});
 const pixelize=plan.command;const initial=await call({action:'document.apply',documentId:id,expectedRevision:revision,commands:[pixelize]});revision=initial.revision;await png(id,name+'-before.png');
 const command={op:'image.finish',autoProtect:true,kind,restoreDetails:true,despeckle:{maxArea:2},outline:name==='anime'?{style:'adaptive',mode:'outer',thickness:1}:false};
 const preview=await call({action:'document.apply',documentId:id,expectedRevision:revision,commands:[command],dryRun:true});assert.equal((await call({action:'document.inspect',documentId:id})).revision,revision);
 const after=await call({action:'document.apply',documentId:id,expectedRevision:revision,commands:[command]});revision=after.revision;await png(id,name+'-after.png');
 const saved=await call({action:'document.save',documentId:id}),raw=JSON.stringify(saved.project);await writeFile(new URL(name+'.bitdraw.json',dir),raw);assert.equal(saved.project.format,'bitdraw-packed');const decoded=await unpackProject(saved.project),legacy=JSON.stringify(legacyProject(decoded));assert.equal(decoded.width,96);assert.equal(decoded.height,74);assert.equal(decoded.metadata.extensions.detailProtection.regions.length,3);
 const reference=JSON.parse(await readFile(new URL(`./real-v8/${name}-icon.bitdraw.json`,import.meta.url),'utf8'));assert.equal(digest(decoded.source.pixels),digest(reference.source.pixels));const reopened=await call({action:'document.open',project:saved.project});const again=await call({action:'document.save',documentId:reopened.id});const againDecoded=await unpackProject(again.project);assert.equal(digest(againDecoded.source.pixels),digest(decoded.source.pixels));assert.deepEqual(againDecoded.frames,decoded.frames);await call({action:'document.markSaved',documentId:id,expectedRevision:revision});
 const report={name,id,reopenedId:reopened.id,source:opened.source,faces:focus.faces.length,automaticProtect:decoded.metadata.extensions.detailProtection.regions,subject:focus.subject,importMs:opened.elapsedMs,focusMs:focus.workerMs,pixelizeMs:initial.workerMs,finishMs:after.workerMs,saveMs:saved.elapsedMs,openMs:reopened.elapsedMs,legacyBytes:Buffer.byteLength(legacy),packedBytes:Buffer.byteLength(raw),sourceExact:true,frameExact:true,stats:after.finish,requestBytes:Buffer.byteLength(JSON.stringify(command)),crop:plan.layout.source};reports.push(report);console.log(JSON.stringify(report));
 if(name==='anime'){
  for(const style of ['solid','adaptive','selective','double']){let r=await call({action:'document.apply',documentId:id,expectedRevision:revision,commands:[pixelize,{...command,outline:{style,mode:'outer',thickness:style==='double'?2:1,color:'#252333',lightColor:'#ffffff',light:'top-left'}}]});revision=r.revision;await png(id,'outline-'+style+'.png');}
  const outlined=await call({action:'document.save',documentId:id});await writeFile(new URL('anime-outline-double.bitdraw.json',dir),JSON.stringify(outlined.project));await call({action:'document.markSaved',documentId:id,expectedRevision:revision});
 }
 await writeFile(new URL('report.json',dir),JSON.stringify(reports,null,2));
}
