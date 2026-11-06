import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {samplingLayout} from '../dist/sampling.js';
const sessionId=process.argv[2],runtime=JSON.parse(await readFile(new URL('../.bitdraw-runtime.json',import.meta.url),'utf8')),dir=new URL('./real-v8/',import.meta.url);
async function call(request){const r=await fetch(runtime.url+'/api/request',{method:'POST',headers:{Authorization:'Bearer '+runtime.token,'Content-Type':'application/json'},body:JSON.stringify({sessionId,request})});const result=await r.json();assert.notEqual(result.ok,false,result.error);return result;}
async function png(id,name,width,height,scale=1){const r=await call({action:'document.export',documentId:id,scale}),bytes=Buffer.from(r.png,'base64');assert.equal(bytes.readUInt32BE(16),width*scale);assert.equal(bytes.readUInt32BE(20),height*scale);await writeFile(new URL(name,dir),bytes);return bytes.length;}
function protectRects(source,output,regions){const {source:s,content:d}=samplingLayout(source,output);return regions.map(r=>{const x=Math.max(d.x,Math.floor(d.x+(r.x-s.x)/s.width*d.width)),y=Math.max(d.y,Math.floor(d.y+(r.y-s.y)/s.height*d.height)),right=Math.min(d.x+d.width,Math.ceil(d.x+(r.x+r.width-s.x)/s.width*d.width)),bottom=Math.min(d.y+d.height,Math.ceil(d.y+(r.y+r.height-s.y)/s.height*d.height));return {x,y,width:right-x,height:bottom-y};}).filter(r=>r.width>0&&r.height>0);}
const fixtures=[{name:'anime',file:'wikipe-tan.png',mime:'image/png',preset:'illustration',width:1110,height:2100,regions:[{x:315,y:365,width:110,height:125},{x:475,y:340,width:130,height:135},{x:415,y:510,width:100,height:95}],crop:{x:120,y:30,width:800,height:710}},
 {name:'photo',file:'nasa-portrait.jpg',mime:'image/jpeg',preset:'photo',width:2250,height:2848,regions:[{x:860,y:565,width:120,height:90},{x:1040,y:570,width:130,height:90},{x:900,y:760,width:240,height:120}],crop:{x:600,y:180,width:900,height:1000}}];
const report=[];
for(const f of fixtures){const started=performance.now(),opened=await call({action:'document.import',name:f.file,mime:f.mime,data:(await readFile(new URL(f.file,dir))).toString('base64')}),id=opened.id;assert.deepEqual(opened.source,{width:f.width,height:f.height});let revision=0;
 const original=await call({action:'document.sourcePreview',documentId:id});await writeFile(new URL(f.name+'-source-preview.png',dir),Buffer.from(original.png,'base64'));
 for(const [width,height]of [[370,320],[240,240],[180,180],[137,91],[96,74]]){
   const padding=width>=180?10:2,crop=width<=137?f.crop:undefined,command={op:'image.pixelize',width,height,fit:'contain',padding,crop,preset:f.preset,colors:24},protect=protectRects(f,command,f.regions),finish={op:'image.finish',protect,despeckle:{maxArea:2,passes:1},restoreDetails:true,outline:f.name==='anime'?{mode:'outer',thickness:1,color:'#343233'}:false};
   const result=await call({action:'document.apply',documentId:id,expectedRevision:revision,commands:[command]});revision=result.revision;
   await png(id,`${f.name}-${width}x${height}-before.png`,width,height);
   const preview=await call({action:'document.apply',documentId:id,expectedRevision:revision,dryRun:true,commands:[finish]});assert.equal((await call({action:'document.inspect',documentId:id})).revision,revision);
   const after=await call({action:'document.apply',documentId:id,expectedRevision:revision,commands:[finish]});revision=after.revision;const bytes=await png(id,`${f.name}-${width}x${height}-after.png`,width,height);
   if(width===96)await png(id,f.name+'-icon-4x.png',width,height,4);
   await writeFile(new URL(`${f.name}-${width}x${height}-commands.json`,dir),JSON.stringify([command,finish],null,2));
   report.push({name:f.name,id,source:[f.width,f.height],native:[width,height],crop:crop??null,protect,stats:after.finish,changedPixels:preview.changes.pixels,bytes,commandsBytes:Buffer.byteLength(JSON.stringify([command,finish]))});
   console.log(JSON.stringify({name:f.name,width,height,stats:after.finish,bytes}));
 }
 const current=await call({action:'document.sourcePreview',documentId:id});assert.equal(current.png,original.png);
 const saved=await call({action:'document.save',documentId:id});assert.equal(saved.project.version,4);await writeFile(new URL(f.name+'-icon.bitdraw.json',dir),JSON.stringify(saved.project));await call({action:'document.markSaved',documentId:id,expectedRevision:revision});
 console.log(JSON.stringify({name:f.name,id,sourcePreviewUnchanged:true,elapsedMs:Math.round(performance.now()-started)}));
}
await writeFile(new URL('report.json',dir),JSON.stringify(report,null,2));
// Reproduce and correct the actual 0.7 plate leak at the same native size.
const old=JSON.parse(await readFile(new URL('./real-v7/coffee-corrected.bitdraw.json',import.meta.url),'utf8')),coffee=await call({action:'document.open',project:old}),id=coffee.id;
await png(id,'coffee-before.png',75,50,8);
const labels=old.metadata.extensions.regionLabels.labels,glaze=labels.find(l=>l.category==='glaze').id,table=labels.find(l=>l.category==='table').id;
const commands=[{op:'region.mask',id:glaze,action:'constrain',outsideId:table,polygon:[{x:25,y:6},{x:39,y:7},{x:50,y:11},{x:56,y:18},{x:60,y:26},{x:59,y:34},{x:54,y:42},{x:45,y:47},{x:30,y:49},{x:18,y:45},{x:11,y:38},{x:9,y:28},{x:10,y:19},{x:14,y:13},{x:20,y:9}]},{op:'region.rules.apply',rules:old.metadata.extensions.regionLabels.lastRules,reference:'source',labelIds:[glaze,table]},{op:'image.finish',despeckle:{maxArea:2},outline:{mode:'inner',color:'#3c2830',labelIds:[glaze]}}];
const preview=await call({action:'document.apply',documentId:id,expectedRevision:0,dryRun:true,commands}),applied=await call({action:'document.apply',documentId:id,expectedRevision:0,commands});
await png(id,'coffee-after.png',75,50,8);await png(id,'coffee-native.png',75,50);const p=await call({action:'document.save',documentId:id});await writeFile(new URL('coffee-fixed.bitdraw.json',dir),JSON.stringify(p.project));await writeFile(new URL('coffee-fix-commands.json',dir),JSON.stringify(commands,null,2));await call({action:'document.markSaved',documentId:id,expectedRevision:1});
await writeFile(new URL('coffee-report.json',dir),JSON.stringify({id,preview,applied},null,2));console.log(JSON.stringify({coffee:id,changes:applied.changes,finish:applied.finish}));
