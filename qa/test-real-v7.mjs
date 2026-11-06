import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {indices} from '../dist/semantic-regions.js';
const sessionId=process.argv[2],runtime=JSON.parse(await readFile(new URL('../.bitdraw-runtime.json',import.meta.url),'utf8'));
const out=new URL('./real-v7/',import.meta.url),hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
async function call(request){const res=await fetch(runtime.url+'/api/request',{method:'POST',headers:{Authorization:'Bearer '+runtime.token,'Content-Type':'application/json'},body:JSON.stringify({sessionId,request})});const r=await res.json();assert.notEqual(r.ok,false,r.error);return r;}
const pts=a=>a.map(([x,y])=>({x,y}));
const fixtures=[{name:'astronaut',targetSize:64,groups:[
 {name:'皮膚',category:'skin',points:pts([[26,14],[29,18],[26,21]])},
 {name:'頭髮',category:'hair',points:pts([[23,6],[32,7],[20,11],[35,11]])},
 {name:'太空服',category:'clothes',points:pts([[11,36],[21,40],[40,36],[8,58],[28,60]])},
 {name:'頭盔與裝備',category:'equipment',points:pts([[27,28],[45,55],[55,36],[19,32]])},
 {name:'背景',category:'background',points:pts([[15,8],[45,8],[60,12],[46,25],[8,16],[3,12],[2,37],[62,58]])}
 ],palettes:{skin:['#69433c','#ac7764','#e2af8b','#f7d6ab'],hair:['#282326','#594732','#92744d','#cfb77a'],clothes:['#73352f','#ae4932','#e07845','#f1b475'],equipment:['#141921','#353e49','#7b8892','#dce3df'],background:['#292837','#645568','#a0a3ac','#d8d5c9']}},
 {name:'coffee',targetSize:80,groups:[
 {name:'咖啡液',category:'coffee',points:pts([[36,19],[32,17],[41,20]])},
 {name:'瓷杯內緣',category:'ceramic',points:pts([[28,5],[47,10],[40,25],[23,13]])},
 {name:'杯身與碟',category:'glaze',points:pts([[15,20],[30,42],[48,36],[29,29],[26,33],[53,21]])},
 {name:'湯匙',category:'metal',points:pts([[46,34],[49,30],[44,39]])},
 {name:'木桌背景',category:'table',points:pts([[5,25],[65,10],[65,43],[12,45],[15,4],[4,3],[38,48]])}
 ],palettes:{coffee:['#663b27','#a36934','#dbab53','#f2d083'],ceramic:['#9b7958','#cfb78e','#f5e5c2','#fff5dc'],glaze:['#2b2130','#68404b','#a95c51','#e99566'],metal:['#242a39','#626d7c','#abb4b8','#ece9d5'],table:['#392b35','#715042','#a88058','#d6b784']}}];
const reports=[];
for(const f of fixtures){
 const imported=await call({action:'document.import',name:`QA 0.7 · ${f.name}`,mime:'image/png',data:(await readFile(new URL(f.name+'.png',out))).toString('base64')}),id=imported.id;
 const original=await call({action:'document.save',documentId:id}),sourceHash=hash(original.project.source);
 const rules={format:'bitdraw-region-rules',version:1,name:f.name+' 配色',categories:Object.entries(f.palettes).map(([category,colors])=>({category,colors,mode:'nearest'}))};
 const command={op:'image.pipeline',targetSize:f.targetSize,colors:24,preset:'photo',uncertainty:.06,groups:f.groups,rules};
 await writeFile(new URL(f.name+'-command.json',out),JSON.stringify(command,null,2));
 await writeFile(new URL(f.name+'-recipe.json',out),JSON.stringify({format:'bitdraw-recipe',version:1,name:f.name+' 測試照片流程',description:'種子只適用此測試照片及尺寸；其他圖片需重新看圖指定位置。',commands:[command]},null,2));
 const start=performance.now(),preview=await call({action:'document.apply',documentId:id,expectedRevision:0,dryRun:true,commands:[command]});assert.equal((await call({action:'document.inspect',documentId:id})).revision,0);
 const applied=await call({action:'document.apply',documentId:id,expectedRevision:0,commands:[command]}),elapsed=Math.round(performance.now()-start);
 const saved=await call({action:'document.save',documentId:id}),p=saved.project;assert.equal(hash(p.source),sourceHash);
 let review=0;for(const l of p.metadata.extensions.regionLabels.labels){if(l.category==='unclassified'){review+=indices(l).length;continue;}for(const i of indices(l)){const color='#'+p.frames[0].cels[l.layerId].slice(i*4,i*4+3).map(v=>v.toString(16).padStart(2,'0')).join('');assert.ok(f.palettes[l.category].includes(color));}}
 const atlas=await call({action:'document.labelAtlas',documentId:id,expectedRevision:1}),png=await call({action:'document.export',documentId:id});
 await writeFile(new URL(f.name+'-atlas.png',out),Buffer.from(atlas.png,'base64'));await writeFile(new URL(f.name+'-pixel.png',out),Buffer.from(png.png,'base64'));await writeFile(new URL(f.name+'.bitdraw.json',out),JSON.stringify(p));
 await call({action:'document.apply',documentId:id,expectedRevision:1,commands:[{op:'undo'}]});assert.deepEqual((await call({action:'document.save',documentId:id})).project,original.project);await call({action:'document.apply',documentId:id,expectedRevision:2,commands:[{op:'redo'}]});
 await call({action:'document.markSaved',documentId:id,expectedRevision:3});
 reports.push({name:f.name,id,width:p.width,height:p.height,seedCount:f.groups.reduce((n,g)=>n+g.points.length,0),labels:applied.labels,reviewPixels:review,totalPixels:p.width*p.height,previewAndApplyMs:elapsed,commandBytes:Buffer.byteLength(JSON.stringify(command)),summaryBytes:Buffer.byteLength(JSON.stringify(applied)),sourcePreserved:true,oneStepUndo:true,paletteMembership:true});
}
await writeFile(new URL('report.json',out),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports));
