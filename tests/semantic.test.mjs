import test from 'node:test';
import assert from 'node:assert/strict';
import {Engine,makeProject,activePixels} from '../dist/core.js';
import {Workspace} from '../dist/workspace.js';
import {regionIndex} from '../dist/region-guide.js';
import {labelState,labelSummary,validateRules,captureRules} from '../dist/semantic-regions.js';
import {pixelPlan} from '../dist/pixel-plan.js';
import {packBackup,unpackBackup} from '../dist/recovery.js';
function setup(){const p=makeProject({width:6,height:4,pixels:new Array(96).fill(0)},'Semantic');p.grid.cellWidth=p.grid.cellHeight=1;const w=new Workspace(),d=w.add(p);w.apply(d.id,[{op:'rebuild'},{op:'paint.rect',x:0,y:0,width:2,height:2,color:'#eeaa88'},{op:'paint.rect',x:2,y:0,width:2,height:2,color:'#334477'},{op:'paint.rect',x:5,y:3,width:1,height:1,color:'#eeaa88'}]);return {w,d};}
function regions(d){return regionIndex(activePixels(d.engine.project),6,4,{tolerance:0}).regions;}
function label(d,ids,name='臉部',category='skin',extra={}){return {op:'region.label',regionIds:ids,name,category,layerId:d.engine.project.activeLayerId,tolerance:0,...extra};}
const rules=(skin=['#ff0000'],clothes=['#0000ff'])=>({format:'bitdraw-region-rules',version:1,name:'角色規則',categories:[{category:'skin',colors:skin,mode:'nearest'},{category:'clothes',colors:clothes,mode:'nearest'}]});
test('named masks group disconnected islands and persist as compact project data, never in summaries',()=>{
 const {w,d}=setup(),r=regions(d);w.apply(d.id,[label(d,r.filter(r=>r.mean==='#eeaa88').map(r=>r.id),'臉與手')]);const s=labelSummary(d.engine.project)[0];assert.equal(s.area,5);assert.equal(s.category,'skin');assert.equal(s.runs,undefined);assert.equal(labelState(d.engine.project).labels[0].runs.length,3);
 const copy=new Engine(JSON.parse(JSON.stringify(d.engine.project)));assert.deepEqual(copy.project,d.engine.project);d.backupKey='semantic-test';const b=packBackup(d,'qa');assert.deepEqual(unpackBackup(b,d.engine.project.source),d.engine.project);
});
test('overlap, unknown region, malformed category, and invalid palette fail atomically',()=>{
 const {w,d}=setup(),r=regions(d);w.apply(d.id,[label(d,[r[0].id])]);const before=structuredClone(d.engine.project);
 for(const command of [label(d,[r[0].id],'重疊'),label(d,['missing']),label(d,[r[1].id],'','skin'),label(d,[r[1].id],'Hair','hair',{palette:['red']})])assert.throws(()=>w.apply(d.id,[command]));
 assert.deepEqual(d.engine.project,before);assert.throws(()=>w.apply(d.id,[{op:'region.label.update',id:'label-1',patch:{category:''}}]));assert.deepEqual(d.engine.project,before);
});
test('named masks keep distinct ownership after identical colors merge geometric regions',()=>{
 const {w,d}=setup(),r=regions(d);w.apply(d.id,[label(d,[r[0].id]),label(d,[r[1].id],'上衣','clothes')]);w.apply(d.id,[{op:'region.rules.apply',rules:rules(['#777777'],['#777777'])}]);assert.equal(regions(d).length,2);
 w.apply(d.id,[{op:'region.rules.apply',rules:rules()}]);const px=activePixels(d.engine.project);assert.deepEqual(px.slice(0,4),[255,0,0,255]);assert.deepEqual(px.slice(8,12),[0,0,255,255]);assert.deepEqual(px.slice(92,96),[238,170,136,255]);assert.equal(labelSummary(d.engine.project).length,2);
});
test('dedicated palette overrides category rule and preserves alpha; capture exports portable colors',()=>{
 const {w,d}=setup(),r=regions(d);activePixels(d.engine.project)[3]=128;w.apply(d.id,[label(d,[r[0].id],'臉','skin',{palette:['#00ff00'],paletteName:'專用'})]);w.apply(d.id,[{op:'region.rules.apply',rules:rules()}]);assert.deepEqual(activePixels(d.engine.project).slice(0,4),[0,255,0,128]);const captured=captureRules(d.engine.project,'可攜規則');assert.deepEqual(captured.categories[0].colors,['#00ff00']);
 w.apply(d.id,[{op:'region.label.update',id:'label-1',patch:{palette:null}}]);w.apply(d.id,[{op:'region.rules.apply',rules:rules()}]);assert.deepEqual(activePixels(d.engine.project).slice(0,4),[255,0,0,128]);
});
test('ramp maps relative lightness, leaves transparent and unassigned pixels untouched, dryRun and undo restore masks',()=>{
 const {w,d}=setup();w.apply(d.id,[{op:'paint.rect',x:1,y:0,width:1,height:2,color:'#ccaa99'}]);const rs=regions(d),chosen=rs.filter(r=>r.bounds.x<2);w.apply(d.id,[label(d,chosen.map(r=>r.id))]);const before=structuredClone(d.engine.project),rule=rules(['#111111','#eeeeee']);rule.categories[0].mode='ramp';const command={op:'region.rules.apply',rules:rule};const v=w.apply(d.id,[command],{expectedRevision:d.revision,dryRun:true});assert.equal(v.changes.pixels,4);assert.deepEqual(d.engine.project,before);w.apply(d.id,[command]);const px=activePixels(d.engine.project);assert.notDeepEqual(px.slice(0,3),px.slice(4,7));assert.equal(px[23],0);w.apply(d.id,[{op:'undo'}]);assert.deepEqual(d.engine.project,before);
});
test('rebuild/delete/merge invalidate labels and undo restores validity; reused layer IDs do not revive masks',()=>{
 const {w,d}=setup();w.apply(d.id,[label(d,[regions(d)[0].id])]);w.apply(d.id,[{op:'rebuild'}]);assert.equal(labelSummary(d.engine.project)[0].stale,true);assert.throws(()=>w.apply(d.id,[{op:'region.rules.apply',rules:rules()}]),/失效/);w.apply(d.id,[{op:'undo'}]);assert.equal(labelSummary(d.engine.project)[0].stale,false);
 w.apply(d.id,[{op:'layer.add'},{op:'paint.rect',x:0,y:0,width:1,height:1,color:'#ffffff'}]);const rr=regionIndex(activePixels(d.engine.project),6,4,{tolerance:0}).regions;w.apply(d.id,[label(d,[rr[0].id],'高光')]);w.apply(d.id,[{op:'layer.delete'},{op:'layer.add'}]);assert.equal(labelSummary(d.engine.project).find(l=>l.name==='高光').stale,true);
 w.apply(d.id,[{op:'layer.mergeDown'}]);assert.ok(labelSummary(d.engine.project).every(l=>l.stale));
});
test('missing category or locked layer rejects whole rule application; label rename/delete are undoable',()=>{
 const {w,d}=setup(),r=regions(d);w.apply(d.id,[label(d,[r[0].id]),label(d,[r[1].id],'頭髮','hair')]);let before=structuredClone(d.engine.project);assert.throws(()=>w.apply(d.id,[{op:'region.rules.apply',rules:rules()}]),/沒有色盤/);assert.deepEqual(d.engine.project,before);
 w.apply(d.id,[{op:'region.label.update',id:'label-2',patch:{category:'clothes',name:'襯衫'}},{op:'layer.update',patch:{locked:true}}]);before=structuredClone(d.engine.project);assert.throws(()=>w.apply(d.id,[{op:'region.rules.apply',rules:rules()}]),/鎖定/);assert.deepEqual(d.engine.project,before);w.apply(d.id,[{op:'region.label.delete',id:'label-2'}]);assert.equal(labelSummary(d.engine.project).length,1);w.apply(d.id,[{op:'undo'}]);assert.equal(labelSummary(d.engine.project)[1].name,'襯衫');
});
test('serialized malformed masks, overlap, duplicate categories, and inconsistent captured category palettes rejected',()=>{
 const {w,d}=setup(),r=regions(d);w.apply(d.id,[label(d,[r[0].id],'臉','skin',{palette:['#ffffff']}),label(d,[r[2].id],'手','skin',{palette:['#000000']})]);assert.throws(()=>captureRules(d.engine.project,'rules'),/不同/);
 const bad=structuredClone(d.engine.project);bad.metadata.extensions.regionLabels.labels[0].runs=[[0,99]];assert.throws(()=>new Engine(bad),/遮罩/);
 const overlap=structuredClone(d.engine.project);overlap.metadata.extensions.regionLabels.labels[1].runs=[[0,1]];assert.throws(()=>new Engine(overlap),/重疊/);
 const duplicate=rules();duplicate.categories[1].category='skin';assert.throws(()=>validateRules(duplicate),/重複/);
});
test('arbitrary gradient source pixelizes to square-cell native grid and bounded palette without changing source',()=>{
 const width=101,height=77,pixels=Array.from({length:width*height*4},(_,i)=>i%4===3?255:(Math.floor(i/4)*(i%4+3))%256);const source={width,height,pixels},p=makeProject(source),e=new Engine(p),before=structuredClone(e.project.source);
 const plan=pixelPlan(source,{targetSize:32,preset:'photo',colors:8});assert.equal(plan.grid.cellWidth,4);assert.equal(plan.width,26);assert.equal(plan.height,20);e.dispatch(plan.command);assert.equal(e.project.width,26);assert.ok(e.project.palette.length<=8);assert.deepEqual(e.project.source,before);assert.ok(activePixels(e.project).filter((_,i)=>i%4===3).every(v=>v===255));e.dispatch({op:'undo'});assert.equal(e.project.width,1);assert.deepEqual(e.project.source,before);
 assert.throws(()=>pixelPlan(source,{targetSize:0}));assert.throws(()=>pixelPlan(source,{preset:'guess'}));
});
test('classification rules contain no image-specific IDs and can recolor freshly labeled second image',()=>{
 const first=setup(),second=setup();first.w.apply(first.d.id,[label(first.d,[regions(first.d)[0].id],'臉','skin',{palette:['#ffeecc']})]);const portable=captureRules(first.d.engine.project,'角色色盤');assert.equal(JSON.stringify(portable).includes('label-'),false);
 second.w.apply(second.d.id,[label(second.d,[regions(second.d)[2].id],'另一張圖的手','skin'),{op:'region.rules.apply',rules:portable}]);assert.deepEqual(activePixels(second.d.engine.project).slice(92,95),[255,238,204]);assert.deepEqual(activePixels(second.d.engine.project).slice(0,3),[238,170,136]);
});
test('polygon labels split connected identical colors and clip region IDs without huge pixel commands',()=>{
 const {w,d}=setup();w.apply(d.id,[{op:'paint.rect',x:0,y:0,width:6,height:4,color:'#777777'}]);
 const left=[{x:0,y:0},{x:3,y:0},{x:3,y:4},{x:0,y:4}],right=[{x:3,y:0},{x:6,y:0},{x:6,y:4},{x:3,y:4}];
 w.apply(d.id,[{op:'region.label',polygon:left,name:'皮膚',category:'skin'},{op:'region.label',polygon:right,regionIds:[regions(d)[0].id],tolerance:0,name:'同色衣物',category:'clothes'}]);assert.deepEqual(labelSummary(d.engine.project).map(l=>l.area),[12,12]);
 w.apply(d.id,[{op:'region.rules.apply',rules:rules()}]);assert.deepEqual(activePixels(d.engine.project).slice(0,3),[255,0,0]);assert.deepEqual(activePixels(d.engine.project).slice(12,15),[0,0,255]);
 const before=structuredClone(d.engine.project);assert.throws(()=>w.apply(d.id,[{op:'region.label',polygon:[{x:0,y:0},{x:1,y:0},{x:2,y:0}],name:'empty',category:'skin'}]),/沒有/);assert.deepEqual(d.engine.project,before);
});
test('v2 migration preserves original pixels while v5 prevents older editors silently ignoring label invariants',()=>{
 const {d}=setup(),old=structuredClone(d.engine.project);old.version=2;const copy=new Engine(old);assert.equal(copy.project.version,5);assert.deepEqual(copy.project.source,old.source);assert.deepEqual(copy.project.frames,old.frames);assert.equal(old.version,2);
});
