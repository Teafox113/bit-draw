import test from 'node:test';import assert from 'node:assert/strict';
import {animeInput,animeOutput,animeLayout} from '../dist/anime-input.js';
import {sampleExact} from '../dist/sampling.js';
import {Engine,makeProject,activePixels} from '../dist/core.js';
import {prepareSubject,subjectOptions} from '../dist/subject-model.js';
import {pixelPlan,compactPlan} from '../dist/pixel-plan.js';
import {packProject,unpackProject} from '../dist/project-codec.js';
test('anime input preserves aspect, odd padding and RGB/255; output excludes padding',()=>{
 const s={width:1,height:3,pixels:Uint8Array.from([255,128,0,255,255,128,0,255,255,128,0,255])},r=animeInput(s,4);
 assert.deepEqual(r.layout,{size:4,width:1,height:4,x:1,y:0});assert.equal(r.data.length,48);assert.equal(r.data[0],0);assert.equal(r.data[1],1);assert.ok(Math.abs(r.data[17]-128/255)<1e-6);
 assert.deepEqual(animeLayout(3,1,4),{size:4,width:4,height:1,x:0,y:1});assert.throws(()=>animeLayout(0,1));
 const raw=new Float32Array(16);for(let y=0;y<4;y++)raw[y*4+1]=.75;
 const o=animeOutput(raw,r.layout,s);assert.equal(o.width,1);assert.equal(o.height,3);assert.ok(o.probability.every(v=>v===.75));assert.throws(()=>animeOutput(new Float32Array(1),r.layout,s));
});
test('anime alpha input is black; bounded probabilities are not min-max stretched',()=>{
 const s={width:2,height:2,pixels:new Uint8Array(16)},r=animeInput(s,4);assert.ok(r.data.every(v=>v===0));
 for(const v of [0,.2,1,NaN,Infinity]){const o=animeOutput(new Float32Array(16).fill(v),r.layout,s);assert.ok(o.probability.every(p=>Number.isFinite(p)&&p>=0&&p<=1));if(v===.2)assert.ok(o.probability.every(p=>p<.21));}
});
test('crisp preserves minority light and dark clusters only inside protected cells',()=>{
 const make=light=>({width:10,height:1,pixels:Array.from({length:10},(_,i)=>[...(i<2?(light?[255,255,255]:[0,0,0]):(light?[15,15,15]:[240,240,240])),255]).flat()}),g={method:'average',alphaThreshold:128,output:{width:1,height:1}},protect=[{x:0,y:0,width:1,height:1}];
 for(const light of [true,false]){const s=make(light),a=sampleExact(s,g,{protect,detailMode:'balanced'}).pixels,b=sampleExact(s,g,{protect,detailMode:'crisp'}).pixels;assert.ok(light?b[0]>a[0]+50:b[0]<a[0]-50);assert.equal(b[3],255);assert.deepEqual(sampleExact(s,g,{detailMode:'crisp'}),sampleExact(s,g,{detailMode:'balanced'}));}
});
test('anime alpha shortcut and crisp plans roundtrip; invalid modes roll back',async()=>{
 const s={width:4,height:4,pixels:Array.from({length:16},(_,i)=>[240,170,100,i%4===0?0:255]).flat()};assert.equal((await prepareSubject(s,'anime')).skipped,'source-alpha');assert.equal(subjectOptions({subjectMode:'anime'}).subjectMode,'anime');
 const o={width:8,height:8,removeBackground:'anime',kind:'illustration',preserveFeatures:true,featureMode:'crisp'},p=pixelPlan(s,o);assert.equal(p.command.featureMode,'crisp');assert.equal(compactPlan(p).grid.output.matte.runs,undefined);
 const e=new Engine(makeProject(s)),original=structuredClone(e.project);e.dispatch(p.command);assert.equal(e.project.metadata.extensions.featureSampling.mode,'crisp');const loaded=new Engine(await unpackProject(await packProject(e.project)));assert.deepEqual(activePixels(loaded.project),activePixels(e.project));e.dispatch({op:'undo'});assert.deepEqual(e.project,original);
 for(const featureMode of ['strong',null,{}]){assert.throws(()=>e.dispatch({op:'image.pixelize',...o,featureMode}));assert.deepEqual(e.project,original);}
});
