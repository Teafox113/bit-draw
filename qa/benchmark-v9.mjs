import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {Engine as Before} from './baseline-v8/core.js';
import {Engine as After} from '../dist/core.js';
const reports=[];
for(const name of ['anime','photo']){const p=JSON.parse(await readFile(new URL(`./real-v8/${name}-icon.bitdraw.json`,import.meta.url),'utf8')),command={op:'image.finish',restoreDetails:true,despeckle:{maxArea:2},protect:p.metadata.extensions.detailProtection.regions},times={before:[],after:[]},outputs={};
 p.source.pixels=Uint8Array.from(p.source.pixels);const engines={before:new Before(p),after:new After(p)},snapshots=Object.fromEntries(Object.entries(engines).map(([key,e])=>[key,e.snapshot()]));
 for(let run=0;run<7;run++)for(const key of (run%2?['after','before']:['before','after'])){const e=engines[key];e.restore(snapshots[key]);e.history=[];e.future=[];global.gc?.();const start=performance.now();e.dispatch(command);const elapsed=performance.now()-start;if(run>=2)times[key].push(Math.round(elapsed*10)/10);outputs[key]=e.project.frames;}
 assert.deepEqual(outputs.before,outputs.after);const median=values=>values.slice().sort((a,b)=>a-b)[2],report={name,operation:'same 0.8 protect rectangles + restoreDetails + despeckle, 96x74 cropped output',method:'2 warmups + 5 alternating runs, restored same canvas, typed source in both engines, explicit GC before each timed operation',times,medianBeforeMs:median(times.before),medianAfterMs:median(times.after),pixelsIdentical:true};reports.push(report);console.log(JSON.stringify(report));}
await writeFile(new URL('./real-v9/benchmark.json',import.meta.url),JSON.stringify(reports,null,2));
