import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine, makeProject, composite, activePixels, validateProject } from '../dist/core.js';
const create = () => {
  const e = new Engine(makeProject({width:2,height:2,pixels:[255,0,0,255,255,0,0,255,0,0,0,0,0,0,0,0]},'Test'));
  e.dispatch({op:'rebuild'});return e;
};
const paint = (e,color,x=0,y=0) => e.dispatch({op:'paint.stroke',color,points:[{x,y}]});
test('transparent new layer and editing leave base pixels intact',()=>{
 const e=create(),base=activePixels(e.project).slice();e.dispatch({op:'layer.add',name:'Details'});paint(e,'#0000ff');
 assert.deepEqual(e.project.frames[0].cels['layer-1'],base);assert.deepEqual(composite(e.project).slice(0,4),[0,0,255,255]);
 e.dispatch({op:'layer.update',patch:{visible:false}});assert.deepEqual(composite(e.project).slice(0,4),[255,0,0,255]);
});
test('opacity and stack order affect the composite; merge preserves result',()=>{
 const e=create();e.dispatch({op:'layer.add'});paint(e,'#0000ff');e.dispatch({op:'layer.update',patch:{opacity:.5}});
 assert.deepEqual(composite(e.project).slice(0,4),[128,0,128,255]);
 const before=composite(e.project);e.dispatch({op:'layer.mergeDown'});assert.deepEqual(composite(e.project),before);assert.equal(e.project.layers.length,1);
 e.dispatch({op:'undo'});assert.equal(e.project.layers.length,2);e.dispatch({op:'layer.move',index:0});assert.deepEqual(composite(e.project).slice(0,4),[255,0,0,255]);
});
test('lock and visibility prevent pixel mutations',()=>{
 const e=create();e.dispatch({op:'layer.update',patch:{locked:true}});const before=JSON.stringify(e.project);
 for(const command of [{op:'fill',x:0,y:0,color:'#ffffff'},{op:'palette.reduce',count:2},{op:'rebuild'},{op:'outline',color:'#ffffff'},{op:'adjust',brightness:10},{op:'layer.delete'}]) assert.throws(()=>e.dispatch(command),/鎖定/);
 assert.deepEqual(e.project,JSON.parse(before));e.dispatch({op:'layer.update',patch:{locked:false,visible:false}});assert.throws(()=>paint(e,'#ffffff'),/顯示/);
});
test('duplicate is an independent cel; deletion is undoable; last layer protected',()=>{
 const e=create();const original=activePixels(e.project).slice();e.dispatch({op:'layer.duplicate'});paint(e,'#123456');
 assert.deepEqual(e.project.frames[0].cels['layer-1'],original);e.dispatch({op:'layer.delete'});assert.equal(e.project.layers.length,1);
 e.dispatch({op:'undo'});assert.equal(e.project.layers.length,2);e.dispatch({op:'redo'});assert.throws(()=>e.dispatch({op:'layer.delete'}));
});
test('multilayer reconstruction rejects changed dimensions atomically',()=>{
 const e=create();e.dispatch({op:'layer.add'});const before=JSON.stringify(e.project);
 assert.throws(()=>e.dispatch({op:'rebuild',grid:{cellWidth:2}}),/維持畫布尺寸/);assert.deepEqual(e.project,JSON.parse(before));
 e.dispatch({op:'rebuild'});validateProject(e.project);
});
test('v1 projects migrate without changing pixels and serialize to v4',()=>{
 const old=create().project;const pixels=activePixels(old).slice();old.version=1;delete old.swatchBooks;delete old.activeBookId;delete old.layers[0].locked;
 const upgraded=new Engine(old);assert.equal(upgraded.project.version,5);assert.deepEqual(activePixels(upgraded.project),pixels);assert.equal(upgraded.project.layers[0].locked,false);
 assert.deepEqual(new Engine(JSON.parse(JSON.stringify(upgraded.project))).project,upgraded.project);assert.equal(old.version,1);
});
test('swatch books persist, normalize colors, reject malformed input and undo',()=>{
 const e=create();e.dispatch({op:'swatch.save',name:'Custom',colors:['#FF0000','#00ff00','#ff0000']});
 assert.deepEqual(e.project.swatchBooks[1].colors,['#ff0000','#00ff00']);const saved=JSON.stringify(e.project);
 assert.throws(()=>e.dispatch({op:'swatch.save',name:'Bad',colors:['red']}));assert.deepEqual(e.project,JSON.parse(saved));
 assert.deepEqual(new Engine(JSON.parse(saved)).project.swatchBooks,e.project.swatchBooks);
 e.dispatch({op:'swatch.delete'});assert.equal(e.project.swatchBooks.length,1);e.dispatch({op:'undo'});assert.equal(e.project.swatchBooks.length,2);
});
test('palette mapping respects region, alpha, and the chosen palette',()=>{
 const e=create();e.dispatch({op:'palette.map',colors:['#001122','#fafafa'],region:{x:0,y:0,width:1,height:2}});
 assert.deepEqual(activePixels(e.project).slice(0,4),[0,17,34,255]);assert.deepEqual(activePixels(e.project).slice(4,8),[255,0,0,255]);assert.equal(activePixels(e.project)[11],0);
});
test('outline reads original pixels without cascading and respects selection',()=>{
 const e=new Engine(makeProject({width:5,height:5,pixels:new Array(100).fill(0)}));e.dispatch({op:'rebuild'});paint(e,'#ffffff',2,2);
 e.dispatch({op:'outline',color:'#ff0000'});assert.equal(activePixels(e.project).filter((v,i)=>i%4===3&&v>0).length,5);
 e.dispatch({op:'undo'});e.dispatch({op:'outline',color:'#ff0000',region:{x:3,y:2,width:1,height:1}});assert.equal(activePixels(e.project).filter((v,i)=>i%4===3&&v>0).length,2);
});
test('brightness, clearing and undo preserve other layers',()=>{
 const e=create();e.dispatch({op:'layer.add'});paint(e,'#808080');e.dispatch({op:'adjust',brightness:10});assert.equal(activePixels(e.project)[0],154);
 e.dispatch({op:'selection.clear',region:{x:0,y:0,width:1,height:1}});assert.equal(activePixels(e.project)[3],0);assert.equal(e.project.frames[0].cels['layer-1'][3],255);
 e.dispatch({op:'undo'});assert.equal(activePixels(e.project)[3],255);
});
test('invalid opacity and duplicate layer IDs are rejected',()=>{
 const e=create();assert.throws(()=>e.dispatch({op:'layer.update',patch:{opacity:NaN}}));e.dispatch({op:'layer.add'});const p=structuredClone(e.project);p.layers[1].id=p.layers[0].id;assert.throws(()=>validateProject(p));
});
