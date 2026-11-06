import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {loadFaceModel,detectFocus} from '../dist/auto-focus.js';
loadFaceModel(await readFile(new URL('../dist/vendor/facefinder',import.meta.url)));
const results=[];
for(const [file,points]of [['anime-icon',[[370,425],[535,410],[465,555]]],['photo-icon',[[920,610],[1100,615],[1020,820]]],['coffee-fixed',[]]]){const p=JSON.parse(await readFile(new URL(`./real-v8/${file}.bitdraw.json`,import.meta.url),'utf8')),r=detectFocus(p.source,{kind:'auto'});assert.equal(r.faces.length,points.length?1:0);const boxes=r.faces.flatMap(f=>f.features),contained=points.filter(([x,y])=>boxes.some(b=>x>=b.x&&y>=b.y&&x<b.x+b.width&&y<b.y+b.height)).length;assert.equal(contained,points.length);results.push({file,faces:r.faces.length,referencePoints:points.length,contained,subject:r.subject.method,review:r.review});}
await writeFile(new URL('./real-v9/focus-checks.json',import.meta.url),JSON.stringify({note:'Six manually selected eye/mouth reference points on two images, plus one no-face negative image; not a general detection accuracy benchmark.',results},null,2));console.log(JSON.stringify(results));
