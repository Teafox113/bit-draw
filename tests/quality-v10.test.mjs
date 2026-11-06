import test from 'node:test';import assert from 'node:assert/strict';
import {Engine,makeProject,activePixels,quantize} from '../dist/core.js';
import {encodeMatte,decodeMatte,compactGrid} from '../dist/subject-mask.js';
import {pixelPlan,compactPlan} from '../dist/pixel-plan.js';
import {sampleExact} from '../dist/sampling.js';
import {subjectOptions,modelInput} from '../dist/subject-model.js';
import {packProject,unpackProject} from '../dist/project-codec.js';
import {Workspace} from '../dist/workspace.js';
const source={width:4,height:1,pixels:[255,0,0,255,255,0,0,255,0,0,255,255,0,0,255,255]};
test('source matte excludes background RGB before averaging and survives lossless project reload/rebuild',async()=>{
 const e=new Engine(makeProject(source)),grid={output:{width:1,height:1,matte:encodeMatte([1,1,0,0],4,1)},method:'average'};e.dispatch({op:'rebuild',grid});assert.deepEqual(activePixels(e.project),[255,0,0,255]);const restored=new Engine(await unpackProject(await packProject(e.project)));restored.dispatch({op:'rebuild'});assert.deepEqual(activePixels(restored.project),[255,0,0,255]);assert.deepEqual(e.project.source,source);
});
test('invalid matte runs, mode, threshold and feature parameters fail atomically',()=>{
 const e=new Engine(makeProject(source)),before=structuredClone(e.project);for(const runs of [[0,5],[2,2,1,1],[0,0],[0,1.5],[0]]){assert.throws(()=>e.dispatch({op:'rebuild',grid:{output:{width:1,height:1,matte:{width:4,height:1,encoding:'runs-v1',runs}}}}));assert.deepEqual(e.project,before);}for(const opts of [{subjectMode:'remote'},{subjectThreshold:NaN},{subjectThreshold:0},{subjectThreshold:1}])assert.throws(()=>subjectOptions(opts));for(const c of [{preserveFeatures:'yes'},{preserveFeatures:true,protect:[]},{removeBackground:true}]){assert.throws(()=>e.dispatch({op:'image.pixelize',width:2,height:2,...c}));assert.deepEqual(e.project,before);}
});
test('balanced feature sampling limits dark-pixel expansion while strong mode remains compatible',()=>{
 const s={width:10,height:1,pixels:Array.from({length:40},(_,i)=>i%4===3?255:i<8?0:240)},grid={output:{width:1,height:1},method:'average',alphaThreshold:128},protect=[{x:0,y:0,width:1,height:1}],a=sampleExact(s,grid,{protect,detailMode:'strong'}).pixels,b=sampleExact(s,grid,{protect,detailMode:'balanced'}).pixels;assert.equal(a[0],0);assert.ok(b[0]>=140&&b[0]<192);assert.equal(b[3],255);assert.throws(()=>sampleExact(s,grid,{detailMode:'guess'}));
});
test('feature-weighted quantization increases minority-feature influence without expanding color budget',()=>{
 const px=Array.from({length:16},(_,i)=>[i===0?10:100+i*8,100,100,255]).flat(),a=quantize(px,16,1,2),b=quantize(px,16,1,2,undefined,Uint8Array.from({length:16},(_,i)=>i===0?1:0));assert.notDeepEqual(a,b);assert.ok(b[0]<a[0]);assert.equal(new Set(Array.from({length:16},(_,i)=>b.slice(i*4,i*4+3).join(','))).size,2);
});
test('compact inspect and pixel plans omit persisted mask runs; source alpha and crop padding remain transparent',()=>{
 const s={width:4,height:4,pixels:Array.from({length:64},(_,i)=>i%4===3&&(Math.floor(i/4)%4===0)?0:255)},plan=pixelPlan(s,{width:8,height:8,padding:1,removeBackground:'fast'});assert.ok(plan.grid.output.matte.runs);assert.equal(compactPlan(plan).grid.output.matte.runs,undefined);assert.equal(compactPlan(plan).command.removeBackground,'fast');const w=new Workspace(),d=w.add(makeProject(s));w.apply(d.id,[plan.command]);assert.equal(w.inspect(d.id).grid.output.matte.runs,undefined);const r=activePixels(d.engine.project);assert.equal(r[3],0);assert.equal(r[(1*8+1)*4+3],0);assert.deepEqual(Array.from(decodeMatte(plan.grid.output.matte)),Array.from(decodeMatte(structuredClone(plan.grid.output.matte))));
});
test('model input is bounded channel-first data and handles transparent/black input without NaN',()=>{for(const pixels of [new Uint8Array(16),new Uint8Array(16).fill(255)]){const t=modelInput({width:2,height:2,pixels},4);assert.equal(t.length,48);assert.ok(t.every(Number.isFinite));}});
test('no-face feature preservation abstains and dry-run/undo are atomic',()=>{const w=new Workspace(),d=w.add(makeProject(source)),before=structuredClone(d.engine.project),command={op:'image.pixelize',width:8,height:8,kind:'photo',preserveFeatures:true};const r=w.apply(d.id,[command],{dryRun:true});assert.equal(r.features.regions,0);assert.deepEqual(d.engine.project,before);w.apply(d.id,[command]);w.apply(d.id,[{op:'undo'}]);assert.deepEqual(d.engine.project,before);});
