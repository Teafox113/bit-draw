// Synthetic continuous-tone portrait fixture; labels below use known fixture colors,
// not a claim of automatic semantic recognition for arbitrary photographs.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {makeProject} from '../dist/core.js';
import {DEFAULT_RULES,labelState,indices} from '../dist/semantic-regions.js';
const sessionId=process.argv[2],runtime=JSON.parse(await readFile(new URL('../.bitdraw-runtime.json',import.meta.url),'utf8'));
async function call(request,fail=false){const res=await fetch(runtime.url+'/api/request',{method:'POST',headers:{Authorization:'Bearer '+runtime.token,'Content-Type':'application/json'},body:JSON.stringify({sessionId,request})});const r=await res.json();if(fail)assert.equal(r.ok,false);else assert.notEqual(r.ok,false,JSON.stringify(r));return r;}
const existing=await call({action:'documents.list'});assert.equal(existing.documents.length,1,'Use a fresh dedicated QA tab');
const width=192,height=256,pixels=[];
const bases={background:[220,228,235],clothes:[50,110,160],skin:[230,173,127],shadow:[157,93,68],hair:[53,36,47],eyes:[15,20,28]};
for(let y=0;y<height;y++)for(let x=0;x<width;x++){
 let category='background';if(y>158&&Math.abs(x-96)<34+(y-158)*.43)category='clothes';
 if(((x-96)/48)**2+((y-100)/65)**2<1){category='skin';if(x<69&&y>82)category='shadow';if(y<68||x<55||x>138&&y<117)category='hair';}
 if(((x-96)/47)**2+((y-62)/30)**2<1&&y<65)category='hair';
 if(((x-79)/4)**2+((y-96)/3)**2<1||((x-113)/4)**2+((y-96)/3)**2<1)category='eyes';
 if(y>128&&y<131&&x>85&&x<107)category='shadow';
 const tone=category==='eyes'?0:Math.round((x/width-.5)*12+(y/height-.5)*8);
 pixels.push(...bases[category].map(c=>Math.max(0,Math.min(255,c+tone))),255);
}
const source={width,height,pixels},sourceHash=createHash('sha256').update(Uint8Array.from(pixels)).digest('hex');
let d=await call({action:'document.open',project:makeProject(source,'QA 0.6 · 任意圖像素化示範')});const id=d.id;
const plan=await call({action:'document.pixelPlan',documentId:id,targetSize:64,colors:16,preset:'photo'});assert.equal(plan.width,48);assert.equal(plan.height,64);
const pixelize={action:'document.apply',documentId:id,expectedRevision:0,commands:[plan.command]};await call({...pixelize,dryRun:true});assert.equal((await call({action:'document.inspect',documentId:id})).revision,0);await call(pixelize);
const sourcePreview=await call({action:'document.sourcePreview',documentId:id});await writeFile(new URL('./portrait-source-v6.png',import.meta.url),Buffer.from(sourcePreview.png,'base64'));
const rules=await call({action:'rule.save',rules:{...DEFAULT_RULES,name:'角色配色 · 像素化範例'}});
async function classify(documentId,revision){
 const groups=new Map();let offset=0,total=0;
 do{const r=await call({action:'document.regions',documentId,tolerance:0,offset,limit:100});total=r.total;
 for(const region of r.regions){const color=region.mean.slice(1).match(/../g).map(v=>parseInt(v,16)),category=Object.entries(bases).sort((a,b)=>a[1].reduce((s,v,k)=>s+(v-color[k])**2,0)-b[1].reduce((s,v,k)=>s+(v-color[k])**2,0))[0][0];if(!groups.has(category))groups.set(category,[]);groups.get(category).push(region.id);}
 offset=r.next;}while(offset!==null);
 const names={skin:'臉與耳朵',hair:'頭髮',clothes:'上衣',shadow:'臉部陰影',eyes:'雙眼',background:'背景'};
 const commands=[...groups].map(([category,regionIds])=>({op:'region.label',name:names[category],category,regionIds,tolerance:0,layerId:'layer-1'}));await call({action:'document.apply',documentId,expectedRevision:revision,commands});return {regions:total,groups:commands.length};
}
const classified=await classify(id,1);const labels=await call({action:'document.labels',documentId:id});assert.ok(labels.labels.some(l=>l.category==='skin'));assert.equal(JSON.stringify(labels).includes('runs'),false);
const run={action:'rule.run',documentId:id,expectedRevision:2,ruleId:rules.id,expectedUpdated:rules.updated};const preview=await call({...run,dryRun:true});assert.ok(preview.changes.pixels>0);await call(run);await call(run,true);
let saved=await call({action:'document.save',documentId:id});assert.equal(createHash('sha256').update(Uint8Array.from(saved.project.source.pixels)).digest('hex'),sourceHash);
for(const l of labelState(saved.project).labels){const allowed=DEFAULT_RULES.categories.find(c=>c.category===l.category).colors;for(const pos of indices(l)){const hex='#'+saved.project.frames[0].cels[l.layerId].slice(pos*4,pos*4+3).map(v=>v.toString(16).padStart(2,'0')).join('');assert.ok(allowed.includes(hex),`${l.category}: ${hex}`);}}
await writeFile(new URL('./classified-v6.bitdraw.json',import.meta.url),JSON.stringify(saved.project));const png=await call({action:'document.export',documentId:id});await writeFile(new URL('./portrait-pixel-v6.png',import.meta.url),Buffer.from(png.png,'base64'));
await call({action:'document.markSaved',documentId:id,expectedRevision:saved.revision});
const reopened=await call({action:'document.open',project:saved.project});assert.deepEqual((await call({action:'document.labels',documentId:reopened.id})).labels,labels.labels);
await call({action:'backup.flush'});const list=await call({action:'backup.list'}),backup=list.backups.find(b=>b.owner===list.owner&&b.name===saved.project.name&&b.revision===3);assert.ok(backup);const restored=await call({action:'backup.restore',backupId:backup.id});assert.deepEqual((await call({action:'document.save',documentId:restored.id})).project,saved.project);await call({action:'document.markSaved',documentId:restored.id,expectedRevision:0});
const imported=await call({action:'document.import',name:'QA 0.6 · 另一尺寸重用規則',mime:'image/png',data:sourcePreview.png});const rev=imported.revision;await call({action:'document.apply',documentId:imported.id,expectedRevision:rev,commands:[{op:'image.pixelize',targetSize:32,colors:16,preset:'photo'}]});const second=await classify(imported.id,rev+1);await call({...run,documentId:imported.id,expectedRevision:rev+2});
const secondProject=await call({action:'document.save',documentId:imported.id});await writeFile(new URL('./classified-small-v6.bitdraw.json',import.meta.url),JSON.stringify(secondProject.project));await call({action:'document.markSaved',documentId:imported.id,expectedRevision:secondProject.revision});
await call({action:'document.apply',documentId:id,expectedRevision:3,commands:[{op:'image.pixelize',targetSize:64,colors:16,preset:'photo'}]});await call({...run,expectedRevision:4},true);await call({action:'document.apply',documentId:id,expectedRevision:4,commands:[{op:'undo'}]});await call({action:'document.markSaved',documentId:id,expectedRevision:5});await call({action:'document.activate',documentId:id});
const report={ok:true,sessionId,documentId:id,ruleId:rules.id,ruleUpdated:rules.updated,source:[width,height],output:[plan.width,plan.height],classified,changedPixels:preview.changes.pixels,second,backupLabelsRoundTrip:true,sourceUnchanged:true,staleLabelsRejected:true,labelsBytes:Buffer.byteLength(JSON.stringify(labels)),projectBytes:Buffer.byteLength(JSON.stringify(saved.project))};await writeFile(new URL('./verification-v6.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
