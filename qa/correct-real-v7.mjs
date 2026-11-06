import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {indices} from '../dist/semantic-regions.js';
const sessionId=process.argv[2],runtime=JSON.parse(await readFile(new URL('../.bitdraw-runtime.json',import.meta.url),'utf8')),out=new URL('./real-v7/',import.meta.url);
async function call(request){const res=await fetch(runtime.url+'/api/request',{method:'POST',headers:{Authorization:'Bearer '+runtime.token,'Content-Type':'application/json'},body:JSON.stringify({sessionId,request})});const r=await res.json();assert.notEqual(r.ok,false,r.error);return r;}
const corrected=[];
const probes={astronaut:[[25,15,'skin'],[29,15,'skin'],[29,5,'hair'],[14,32,'clothes'],[15,53,'clothes'],[33,43,'clothes'],[10,4,'background'],[53,6,'background'],[60,29,'background'],[50,50,'equipment'],[44,59,'equipment'],[22,28,'equipment'],[2,24,'background'],[56,57,'equipment']],coffee:[[37,18,'coffee'],[40,22,'coffee'],[35,6,'ceramic'],[47,16,'ceramic'],[24,10,'ceramic'],[15,25,'glaze'],[22,40,'glaze'],[38,40,'glaze'],[46,36,'metal'],[48,32,'metal'],[7,38,'table'],[62,20,'table'],[58,41,'table']]};
function score(p,points){const ls=p.metadata.extensions.regionLabels.labels,masks=ls.map(l=>new Set(indices(l)));return points.map(([x,y,expected])=>({x,y,expected,actual:ls[masks.findIndex(m=>m.has(y*p.width+x))]?.category??'unassigned'}));}
for(const name of ['astronaut','coffee']){
 const before=JSON.parse(await readFile(new URL(name+'.bitdraw.json',out),'utf8')),opened=await call({action:'document.open',project:before}),id=opened.id,cmd=JSON.parse(await readFile(new URL(name+'-command.json',out),'utf8'));
 const maskCommands=name==='astronaut'?[{op:'region.mask',id:'label-5',action:'add',polygon:[{x:0,y:0},{x:8,y:0},{x:8,y:17},{x:12,y:27},{x:0,y:37}],overlap:'transfer'},{op:'region.mask',id:'label-4',action:'add',points:[{x:55,y:56},{x:56,y:58}],radius:3,overlap:'transfer'}]:[];
 const commands=[...maskCommands,{op:'region.rules.apply',reference:'source',rules:cmd.rules,labelIds:before.metadata.extensions.regionLabels.labels.filter(l=>l.category!=='unclassified').map(l=>l.id)}];
 const preview=await call({action:'document.apply',documentId:id,expectedRevision:0,dryRun:true,commands});assert.equal((await call({action:'document.inspect',documentId:id})).revision,0);await call({action:'document.apply',documentId:id,expectedRevision:0,commands});
 const saved=await call({action:'document.save',documentId:id});assert.deepEqual(saved.project.source,before.source);await writeFile(new URL(name+'-corrected.bitdraw.json',out),JSON.stringify(saved.project));await writeFile(new URL(name+'-corrections.json',out),JSON.stringify(commands,null,2));
 for(const [suffix,request]of [['final.png',{action:'document.export',scale:8}],['final-native.png',{action:'document.export'}],['final-atlas.png',{action:'document.labelAtlas',expectedRevision:1}]]){const r=await call({...request,documentId:id});await writeFile(new URL(name+'-'+suffix,out),Buffer.from(r.png,'base64'));}
 await call({action:'document.markSaved',documentId:id,expectedRevision:1});
 const report={name,id,before:score(before,probes[name]),after:score(saved.project,probes[name]),correctionCommands:maskCommands.length,changedPixels:preview.changes.pixels};report.beforeCorrect=report.before.filter(x=>x.expected===x.actual).length;report.afterCorrect=report.after.filter(x=>x.expected===x.actual).length;corrected.push(report);
}
await writeFile(new URL('correction-report.json',out),JSON.stringify(corrected,null,2));console.log(JSON.stringify(corrected));
