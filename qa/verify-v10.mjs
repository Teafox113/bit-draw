import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Engine,makeProject,activePixels} from '../dist/core.js';
import {unpackProject,packProject} from '../dist/project-codec.js';
import {loadFaceModel,detectFocus,focusSummary,analysisRaster,focusCrop} from '../dist/auto-focus.js';
import {prepareSubject} from '../dist/subject-model.js';
import {decodeMatte} from '../dist/subject-mask.js';
import {png} from './png.mjs';
const dir=new URL('./real-v10/',import.meta.url);await mkdir(dir,{recursive:true});loadFaceModel(await readFile(new URL('../dist/vendor/facefinder',import.meta.url)));
const source=async name=>(await unpackProject(JSON.parse(await readFile(new URL('./real-v9/'+name+'.bitdraw.json',import.meta.url),'utf8')))).source;
const photo=await source('photo'),anime=await source('anime'),coffee=JSON.parse(await readFile(new URL('./real-v8/coffee-fixed.bitdraw.json',import.meta.url),'utf8')).source;
const busy={width:anime.width,height:anime.height,pixels:new Uint8Array(anime.pixels.length)},truth=new Uint8Array(anime.width*anime.height);
for(let y=0;y<anime.height;y++)for(let x=0;x<anime.width;x++){const i=(y*anime.width+x)*4,j=(Math.floor(y/anime.height*coffee.height)*coffee.width+Math.floor(x/anime.width*coffee.width))*4,a=anime.pixels[i+3]/255;truth[i/4]=a>=.5?1:0;for(let k=0;k<3;k++)busy.pixels[i+k]=Math.round(anime.pixels[i+k]*a+coffee.pixels[j+k]*(1-a));busy.pixels[i+3]=255;}
await writeFile(new URL('anime-busy-source.png',dir),png(busy.width,busy.height,busy.pixels));
const hash=p=>createHash('sha256').update(Uint8Array.from(p)).digest('hex'),reports=[];
for(const [name,s,kind,preset]of [['photo',photo,'photo','photo'],['anime',anime,'illustration','illustration'],['anime-busy',busy,'illustration','illustration']]){
 const original=hash(s.pixels),base=new Engine(makeProject(s,name,{compactSource:true})),input=base.project.source,t=performance.now();await prepareSubject(input,'quality');const focus=detectFocus(input,{kind,subjectMode:'quality'}),fast=detectFocus(input,{kind});let crop;
 try{crop=focusCrop(input,'face',kind);}catch{crop=focusCrop(input,'subject',kind,{subjectMode:'quality'});}
 const preview=analysisRaster(input,512);await writeFile(new URL(name+'-source.png',dir),png(preview.width,preview.height,preview.pixels));
 for(const [label,f]of [['fast',fast],['model',focus]]){const px=preview.pixels.slice();for(let y=0;y<preview.height;y++)for(let x=0;x<preview.width;x++)if(!f.mask[Math.floor(y/preview.height*f.maskHeight)*f.maskWidth+Math.floor(x/preview.width*f.maskWidth)]){const i=(y*preview.width+x)*4;for(let k=0;k<3;k++)px[i+k]=Math.round(px[i+k]*.2+30);}await writeFile(new URL(name+'-'+label+'-mask.png',dir),png(preview.width,preview.height,px));}
 let iou;if(name==='anime-busy'){iou={};for(const [key,f]of [['fast',fast],['model',focus]]){let intersection=0,union=0,fp=0,fn=0;for(let y=0;y<input.height;y++)for(let x=0;x<input.width;x++){const a=truth[y*input.width+x],b=f.mask[Math.floor(y/input.height*f.maskHeight)*f.maskWidth+Math.floor(x/input.width*f.maskWidth)];intersection+=a&&b?1:0;union+=a||b?1:0;fp+=!a&&b?1:0;fn+=a&&!b?1:0;}iou[key]={iou:intersection/union,falsePositive:fp,falseNegative:fn};}}
 const report={name,source:{width:s.width,height:s.height},focus:focusSummary(focus),analysisMs:Math.round(performance.now()-t),iou,variants:[]};
 for(const [width,height,label]of [[96,74,'icon'],[48,48,'tiny'],[180,180,'full']]){
  const cropOptions=label==='full'?{}:{crop},command={op:'image.pixelize',width,height,padding:3,colors:24,kind,preset,...cropOptions};
  base.dispatch(command);base.dispatch({op:'image.finish',autoProtect:true,kind,restoreDetails:true,detailMode:'strong',despeckle:{maxArea:2}});if(fast.subject.reliability!=='none')base.dispatch({op:'image.cutout',autoSubject:true,kind,allowUncertain:true});await writeFile(new URL(name+'-'+label+'-before.png',dir),png(width,height,activePixels(base.project)));
  const after={...command,removeBackground:'quality',preserveFeatures:true,finish:{autoProtect:true,kind,restoreDetails:true,detailMode:'balanced',despeckle:{maxArea:2}}},at=performance.now();base.dispatch(after);const elapsedMs=Math.round(performance.now()-at);await writeFile(new URL(name+'-'+label+'-after.png',dir),png(width,height,activePixels(base.project)));
  assert.equal(hash(base.project.source.pixels),original);assert.equal(base.project.width,width);assert.equal(base.project.height,height);assert.ok(base.project.palette.length<=24);assert.ok(activePixels(base.project).filter((_,i)=>i%4===3).every(a=>a===0||a===255));
  report.variants.push({label,width,height,elapsedMs,colors:base.project.palette.length,features:base.project.metadata.extensions.featureSampling,finish:base.project.metadata.extensions.lastFinish,requestBytes:Buffer.byteLength(JSON.stringify(after))});
  if(label==='icon'){const packed=await packProject(base.project);await writeFile(new URL(name+'.bitdraw.json',dir),JSON.stringify(packed));const reopened=new Engine(await unpackProject(packed));assert.equal(hash(activePixels(reopened.project)),hash(activePixels(base.project)));assert.deepEqual(decodeMatte(reopened.project.grid.output.matte),decodeMatte(base.project.grid.output.matte));}
 }
 reports.push(report);console.log(JSON.stringify({name,faces:focus.faces.length,subject:focus.subject,iou,variants:report.variants}));
}
await writeFile(new URL('report.json',dir),JSON.stringify(reports,null,2));
