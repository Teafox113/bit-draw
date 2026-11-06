import test from 'node:test';
import assert from 'node:assert/strict';
import {Workspace,COMMANDS} from '../dist/workspace.js';
import {Engine,makeProject,activePixels} from '../dist/core.js';
import {inspectRegions,regionIndex,colorCandidates} from '../dist/region-guide.js';
import {resolveRecipe,validateRecipe} from '../dist/recipes.js';
import {BackupCoordinator,packBackup,unpackBackup,backupSummary} from '../dist/recovery.js';
function setup(){const p=makeProject({width:6,height:4,pixels:new Array(96).fill(0)},'Backup Test');p.grid.cellWidth=p.grid.cellHeight=1;const e=new Engine(p);e.dispatch({op:'rebuild'});const w=new Workspace(),d=w.add(e.project);return {w,d};}
const rect={op:'paint.rect',x:0,y:0,width:2,height:2,color:'#ff0000'};
const recipe={format:'bitdraw-recipe',version:1,name:'Tint',parameters:{color:{type:'color',default:'#00ff00'},x:{type:'integer',min:0,max:4,default:0}},commands:[{...rect,x:{$param:'x'},color:{$param:'color'}}]};
test('recipe parameters are typed full-value substitutions; recipe runs as one undo step',()=>{
 const {w,d}=setup();const r=validateRecipe(recipe,COMMANDS),cmd=resolveRecipe(r,{x:3},COMMANDS);assert.equal(cmd[0].x,3);assert.equal(cmd[0].color,'#00ff00');w.apply(d.id,[{op:'layer.add'},...cmd],{expectedRevision:0});assert.equal(d.engine.history.length,1);w.apply(d.id,[{op:'undo'}]);assert.equal(d.engine.project.layers.length,1);assert.ok(activePixels(d.engine.project).every(v=>v===0));
 assert.throws(()=>resolveRecipe(r,{x:5},COMMANDS),/參數/);assert.throws(()=>resolveRecipe(r,{color:'red'},COMMANDS),/參數/);assert.throws(()=>resolveRecipe(r,{unknown:1},COMMANDS),/未知/);assert.throws(()=>validateRecipe({...r,commands:[{op:'shell'}]},COMMANDS),/不支援/);assert.throws(()=>validateRecipe({...r,commands:[{...rect,color:{$param:'missing'}}]},COMMANDS),/未知/);
});
test('region IDs survive color-only edits and unrelated island insertion, separate disconnected same-color islands',()=>{
 const {w,d}=setup();w.apply(d.id,[{...rect,x:2},{...rect,x:5,width:1}]);let report=inspectRegions(d.engine.project,{tolerance:0});assert.equal(report.total,2);const region=report.regions.find(r=>r.bounds.x===2);assert.equal(region.area,4);
 const cmd={...region.command,color:'#0000ff'};const preview=w.apply(d.id,[cmd],{expectedRevision:1,dryRun:true});assert.equal(preview.changes.pixels,4);assert.equal(d.revision,1);w.apply(d.id,[cmd],{expectedRevision:1});assert.equal(inspectRegions(d.engine.project,{tolerance:0}).regions.find(r=>r.bounds.x===2).id,region.id);
 w.apply(d.id,[{op:'paint.rect',x:0,y:3,width:1,height:1,color:'#ffffff'}]);assert.equal(inspectRegions(d.engine.project,{tolerance:0}).regions.find(r=>r.bounds.x===2).id,region.id);
});
test('verified paint rejects changed topology, wrong layer and stale revision without partial edits',()=>{
 const {w,d}=setup();w.apply(d.id,[rect]);const command=inspectRegions(d.engine.project,{tolerance:0}).regions[0].command;
 w.apply(d.id,[{op:'paint.rect',x:2,y:0,width:1,height:1,color:'#ff0000'}]);const before=structuredClone(d.engine.project);
 assert.throws(()=>w.apply(d.id,[{...command,color:'#ffffff'}],{expectedRevision:1}),/版本衝突/);
 assert.throws(()=>w.apply(d.id,[{...command,color:'#ffffff'}],{expectedRevision:2}),/形狀/);assert.deepEqual(d.engine.project,before);
 assert.throws(()=>w.apply(d.id,[{...command,layerId:'other'}]),/圖層不符/);
});
test('segmentation respects holes, alpha, four/eight connectivity, and palette candidates are ranked',()=>{
 const px=new Array(16).fill(0);px.splice(0,4,255,0,0,90);px.splice(12,4,255,0,0,255);
 assert.equal(regionIndex(px,2,2,{tolerance:0,connectivity:4}).regions.length,2);assert.equal(regionIndex(px,2,2,{tolerance:0,connectivity:8}).regions.length,1);
 assert.equal(colorCandidates('#f00000',['#ffffff','#000000','#ff0000'])[0].color,'#ff0000');
 const {w,d}=setup();w.apply(d.id,[rect]);activePixels(d.engine.project)[3]=90;const c=inspectRegions(d.engine.project,{tolerance:0}).regions[0].command;w.apply(d.id,[{...c,color:'#ffffff'}]);assert.equal(activePixels(d.engine.project)[3],90);
});
test('backup pack/unpack preserves source, layers, palette, pending grid and view but freezes captured pixels',()=>{
 const {w,d}=setup();w.apply(d.id,[rect,{op:'layer.add'},{...rect,color:'#00ff00'}]);d.view={gridValues:{cellWidth:'2'},compareMode:'overlay',overlayOpacity:40};d.backupKey='test';
 d.engine.project.source.pixels.splice(0,4,27,64,182,128);
 const snapshot=packBackup(d,'session');assert.ok(snapshot.project.frames[0].cels['layer-1'] instanceof Uint8Array);assert.equal(snapshot.project.source,undefined);const restored=unpackBackup(snapshot,d.engine.project.source);assert.deepEqual(restored,d.engine.project);assert.doesNotThrow(()=>new Engine(restored));
 w.apply(d.id,[{op:'project.rename',name:'Changed'}]);assert.equal(snapshot.project.name,'Backup Test');assert.equal(snapshot.view.gridValues.cellWidth,'2');assert.equal(JSON.stringify(backupSummary(snapshot)).includes('pixels'),false);assert.throws(()=>unpackBackup(snapshot,null),/不完整/);
});
test('backup coordinator retries quota failure, skips unchanged state and snapshots each document independently',async()=>{
 const {w,d}=setup();w.apply(d.id,[rect]);let fail=true;const saved=[],store={async putBackup(s,source){if(fail)throw Error('QuotaExceeded');saved.push({s,source});}};
 const coordinator=new BackupCoordinator(store,'owner');await assert.rejects(coordinator.flush(w.documents),/Quota/);fail=false;assert.equal((await coordinator.flush(w.documents)).saved,1);assert.equal((await coordinator.flush(w.documents)).saved,0);
 d.view.gridValues={cellWidth:'invalid'};assert.equal((await coordinator.flush(w.documents)).saved,1);const b=w.add(d.engine.project,{dirty:true});assert.equal((await coordinator.flush(w.documents)).saved,1);assert.notEqual(d.backupKey,b.backupKey);assert.equal(saved[0].s.project.name,'Backup Test');
});
test('backup snapshot revision cannot race a later UI edit while storage is delayed',async()=>{
 const {w,d}=setup();w.apply(d.id,[rect]);let release;const wait=new Promise(r=>release=r),items=[];const c=new BackupCoordinator({async putBackup(s){await wait;items.push(s);}},'owner');
 const pending=c.flush(w.documents);w.apply(d.id,[{op:'project.rename',name:'After'}]);release();await pending;assert.equal(items[0].revision,1);assert.equal(items[0].project.name,'Backup Test');await c.flush(w.documents);assert.equal(items[1].revision,2);assert.equal(items[1].project.name,'After');
});
