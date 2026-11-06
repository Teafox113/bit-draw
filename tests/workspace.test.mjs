import test from 'node:test';
import assert from 'node:assert/strict';
import {Workspace} from '../dist/workspace.js';
import {makeProject,Engine,activePixels} from '../dist/core.js';
function project(){const p=makeProject({width:4,height:4,pixels:new Array(64).fill(0)},'Test');p.grid.cellWidth=p.grid.cellHeight=1;const e=new Engine(p);e.dispatch({op:'rebuild'});return e.project;}
const paint={op:'paint.stroke',color:'#ff0000',points:[{x:1,y:2}]};
test('documents have stable IDs, independent pixels/history, and dirty close protection',()=>{
 const w=new Workspace(),a=w.add(project()),b=w.add(project());w.apply(a.id,[paint]);assert.equal(a.revision,1);assert.equal(b.revision,0);assert.equal(activePixels(b.engine.project)[(2*4+1)*4+3],0);assert.equal(b.engine.history.length,0);assert.throws(()=>w.close(a.id),/尚未儲存/);w.close(a.id,{discard:true});assert.equal(w.activeId,b.id);assert.throws(()=>w.close(b.id),/保留/);
});
test('batch is atomic, reports changed bounds and becomes one undo step',()=>{
 const w=new Workspace(),d=w.add(project()),before=structuredClone(d.engine.project);const r=w.apply(d.id,[{op:'layer.add',name:'Agent'},paint,{op:'project.rename',name:'Result'}],{expectedRevision:0});assert.equal(r.changes.pixels,1);assert.deepEqual(r.changes.bounds,{x:1,y:2,width:1,height:1});assert.equal(d.engine.history.length,1);w.apply(d.id,[{op:'undo'}],{expectedRevision:1});assert.deepEqual(d.engine.project,before);assert.equal(d.revision,2);w.apply(d.id,[{op:'redo'}]);assert.equal(d.engine.project.name,'Result');
});
test('dry run leaves project, revision, dirty status, history and redo untouched',()=>{
 const w=new Workspace(),d=w.add(project());w.apply(d.id,[paint]);w.apply(d.id,[{op:'undo'}]);const before=JSON.parse(JSON.stringify(d));const r=w.apply(d.id,[{op:'layer.add'},paint],{expectedRevision:2,dryRun:true});assert.equal(r.changes.pixels,1);assert.equal(r.revision,2);assert.deepEqual(JSON.parse(JSON.stringify(d)),before);
});
test('stale revision and partial batch failure do not change a document',()=>{
 const w=new Workspace(),d=w.add(project());w.apply(d.id,[paint]);const before=JSON.parse(JSON.stringify(d));assert.throws(()=>w.apply(d.id,[{op:'layer.add'}],{expectedRevision:0}),/版本衝突/);assert.deepEqual(JSON.parse(JSON.stringify(d)),before);assert.throws(()=>w.apply(d.id,[{op:'layer.add'},{op:'paint.stroke',points:[{x:99,y:0}],color:'#ffffff'}]));assert.deepEqual(JSON.parse(JSON.stringify(d)),before);assert.throws(()=>w.apply(d.id,[paint,{op:'undo'}]),/單獨/);
});
test('compact RLE preserves alpha and bounds, inspect excludes pixel arrays',()=>{
 const w=new Workspace(),d=w.add(project());w.apply(d.id,[paint]);activePixels(d.engine.project)[(2*4+1)*4+3]=100;const r=w.readRegion(d.id,{x:0,y:2,width:4,height:1},'layer-1');assert.deepEqual(r.colors,['#00000000','#ff000064']);assert.deepEqual(r.runs,[[0,1],[1,1],[0,2]]);assert.ok(!JSON.stringify(w.inspect(d.id)).includes('pixels'));assert.throws(()=>w.readRegion(d.id,{x:3,y:0,width:2,height:1}));assert.throws(()=>w.readRegion(d.id,{x:0,y:0,width:1,height:1},'missing'));
});
test('at most eight documents; close never reuses document identity',()=>{
 const w=new Workspace();for(let i=0;i<8;i++)w.add(project());assert.throws(()=>w.add(project()),/8/);w.close('doc-4');assert.equal(w.add(project()).id,'doc-9');
});
test('compact shape commands draw exact rectangles and lines, honor selection and rollback',()=>{
 const w=new Workspace(),d=w.add(project());w.apply(d.id,[{op:'paint.rect',x:0,y:0,width:4,height:4,color:'#ffffff',filled:false},{op:'paint.line',from:{x:0,y:0},to:{x:3,y:3},color:'#ff0000',region:{x:1,y:1,width:2,height:2}}]);const px=activePixels(d.engine.project);assert.deepEqual(px.slice(0,4),[255,255,255,255]);assert.deepEqual(px.slice(20,24),[255,0,0,255]);assert.deepEqual(px.slice(40,44),[255,0,0,255]);assert.deepEqual(px.slice(24,28),[0,0,0,0]);const before=structuredClone(d.engine.project);assert.throws(()=>w.apply(d.id,[{op:'paint.rect',x:3,y:3,width:2,height:2,color:'#ffffff'}]));assert.deepEqual(d.engine.project,before);
});
