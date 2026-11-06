import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {indices} from '../dist/semantic-regions.js';
const sessionId=process.argv[2],runtime=JSON.parse(await readFile(new URL('../.bitdraw-runtime.json',import.meta.url),'utf8')),out=new URL('./real-v7/',import.meta.url);
async function call(request){const res=await fetch(runtime.url+'/api/request',{method:'POST',headers:{Authorization:'Bearer '+runtime.token,'Content-Type':'application/json'},body:JSON.stringify({sessionId,request})});const r=await res.json();assert.notEqual(r.ok,false,r.error);return r;}
const id='doc-3',cmd=JSON.parse(await readFile(new URL('coffee-command.json',out),'utf8')),before=await call({action:'document.save',documentId:id});assert.equal(before.revision,2);const mask=before.project.metadata.extensions.regionLabels.labels.find(l=>l.category==='metal');assert.ok(indices(mask).includes(32*75+48));
const recolor={op:'region.rules.apply',reference:'source',rules:cmd.rules,labelIds:before.project.metadata.extensions.regionLabels.labels.filter(l=>l.category!=='unclassified').map(l=>l.id)};
await call({action:'document.apply',documentId:id,expectedRevision:2,commands:[recolor]});
const saved=await call({action:'document.save',documentId:id});await writeFile(new URL('coffee-corrected.bitdraw.json',out),JSON.stringify(saved.project));
for(const [suffix,request]of [['final.png',{action:'document.export',scale:8}],['final-native.png',{action:'document.export'}],['final-atlas.png',{action:'document.labelAtlas',expectedRevision:3}]]){const r=await call({...request,documentId:id});await writeFile(new URL('coffee-'+suffix,out),Buffer.from(r.png,'base64'));}
await call({action:'document.markSaved',documentId:id,expectedRevision:3});
const report=JSON.parse(await readFile(new URL('correction-report.json',out),'utf8')),coffee=report.find(r=>r.name==='coffee');coffee.after=coffee.after.map(v=>({...v,actual:saved.project.metadata.extensions.regionLabels.labels.find(l=>indices(l).includes(v.y*75+v.x))?.category}));coffee.afterCorrect=coffee.after.filter(v=>v.expected===v.actual).length;coffee.correctionCommands=1;coffee.uiCorrectionPixels=7;await writeFile(new URL('correction-report.json',out),JSON.stringify(report,null,2));
const corrections=[{op:'region.mask',id:mask.id,action:'add',points:[{x:48,y:32},{x:47,y:33}],radius:1,overlap:'transfer'},recolor];await writeFile(new URL('coffee-corrections.json',out),JSON.stringify(corrections,null,2));
console.log(JSON.stringify({ok:true,id,revision:3,afterCorrect:coffee.afterCorrect,samples:coffee.after.length,uiCorrectionPixels:7}));
