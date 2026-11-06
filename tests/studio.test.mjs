import test from 'node:test';
import assert from 'node:assert/strict';
import {Engine,makeProject,activePixels,analyzeSource,parseColor,validateProject,composite} from '../dist/core.js';
import {mixRgb,hsvToRgb,rgbToHsv,segmentRegions,outlinePixels,PRESET_PALETTES} from '../dist/color-tools.js';
const source=(w,h,colors)=>({width:w,height:h,pixels:colors.flatMap(c=>c?parseColor(c):[0,0,0,0])});
const engine=s=>{const p=makeProject(s);p.grid.cellWidth=p.grid.cellHeight=1;const e=new Engine(p);e.dispatch({op:'rebuild'});return e;};
test('source analysis uses original pixels, excludes transparency and reports weighted shares',()=>{
 const s=source(4,1,['#ff0000','#ff0000','#0000ff',null]),e=engine(s);
 e.dispatch({op:'paint.stroke',points:[{x:0,y:0}],color:'#ffffff'});
 const a=analyzeSource(e.project.source,2);assert.equal(a.estimated,false);assert.equal(a.visible,3);assert.deepEqual(a.colors.map(c=>[c.hex,c.count]),[['#ff0000',2],['#0000ff',1]]);assert.ok(Math.abs(a.colors[0].percent-200/3)<1e-9);
 e.dispatch({op:'palette.analyze',count:2});assert.deepEqual(e.project.swatchBooks.at(-1).colors,['#ff0000','#0000ff']);assert.deepEqual(e.project.source,s);
});
test('large source analysis is deterministic, bounded and labeled as sampled',()=>{
 const s={width:512,height:256,pixels:Array.from({length:512*256},(_,i)=>i%2?[255,0,0,255]:[0,0,255,255]).flat()};
 const a=analyzeSource(s,8),b=analyzeSource(s,8);assert.deepEqual(a,b);assert.equal(a.samples,65536);assert.equal(a.estimated,true);assert.equal(a.colors.length,2);assert.ok(a.colors.every(c=>c.percent>48&&c.percent<52));
 assert.deepEqual(analyzeSource(source(1,1,[null]),8).colors,[]);
});
test('RGB mixing has exact endpoints, validates percentages, and saves an undoable swatch',()=>{
 assert.deepEqual(mixRgb([255,0,0],[0,0,255],50),[128,0,128]);assert.deepEqual(mixRgb([1,2,3],[4,5,6],0),[1,2,3]);assert.deepEqual(mixRgb([1,2,3],[4,5,6],100),[4,5,6]);assert.throws(()=>mixRgb([0,0,0],[1,1,1],101));
 const e=engine(source(1,1,['#123456'])),before=structuredClone(e.project);e.dispatch({op:'palette.mix',a:'#ff0000',b:'#0000ff',percent:50});assert.equal(e.project.swatchBooks[0].colors.at(-1),'#800080');e.dispatch({op:'undo'});assert.deepEqual(e.project,before);
});
test('merging swatches removes duplicates without changing pixels and restores with undo',()=>{
 const e=engine(source(2,1,['#ff0000','#0000ff']));e.dispatch({op:'swatch.save',name:'Test',colors:['#ff0000','#0000ff','#800080','#ffffff']});const before=structuredClone(e.project);
 e.dispatch({op:'swatch.replace',from:['#FF0000','#0000ff'],color:'#800080'});assert.deepEqual(e.project.swatchBooks.at(-1).colors,['#800080','#ffffff']);assert.deepEqual(activePixels(e.project),activePixels(before));e.dispatch({op:'undo'});assert.deepEqual(e.project,before);
 assert.throws(()=>e.dispatch({op:'swatch.replace',from:['#123456'],color:'#ffffff'}),/沒有/);
});
test('color replacement is selection-bounded, non-cascading, alpha-preserving and undoable',()=>{
 const e=engine(source(4,1,['#ff0000','#fe0000','#0000ff','#ff0000']));activePixels(e.project)[3]=64;const before=activePixels(e.project).slice();
 e.dispatch({op:'color.replace',from:['#ff0000','#0000ff'],color:'#123456',tolerance:1,region:{x:0,y:0,width:3,height:1}});
 assert.deepEqual(activePixels(e.project),[18,52,86,64,18,52,86,255,18,52,86,255,255,0,0,255]);assert.deepEqual(e.project.source.pixels.slice(0,4),[255,0,0,255]);e.dispatch({op:'undo'});assert.deepEqual(activePixels(e.project),before);
});
test('region detection keeps disconnected islands separate and handles diagonal connectivity',()=>{
 const s=source(3,3,['#ff0000',null,'#ff0000',null,'#ff0000',null,'#ff0000',null,'#ff0000']);
 assert.equal(segmentRegions(s.pixels,3,3,{tolerance:0}).regions.length,5);const eight=segmentRegions(s.pixels,3,3,{connectivity:8});assert.equal(eight.regions.length,1);assert.equal(eight.regions[0].area,5);assert.equal(eight.labels[1],-1);
});
test('region color tolerance compares against seed instead of bridging a long gradient',()=>{
 const s=source(4,1,['#101010','#202020','#303030','#404040']);const r=segmentRegions(s.pixels,4,1,{tolerance:16});assert.deepEqual([...r.labels],[0,0,1,1]);assert.deepEqual(r.regions.map(x=>x.area),[2,2]);
});
test('region painting edits only a connected island and respects rectangle and alpha',()=>{
 const e=engine(source(4,1,['#ff0000','#ff0000',null,'#ff0000']));activePixels(e.project)[3]=100;
 e.dispatch({op:'region.paint',x:0,y:0,color:'#00ff00',tolerance:0,region:{x:0,y:0,width:1,height:1}});assert.deepEqual(activePixels(e.project),[0,255,0,100,255,0,0,255,0,0,0,0,255,0,0,255]);
 assert.throws(()=>e.dispatch({op:'region.paint',x:2,y:0,color:'#ffffff'}),/非透明/);
});
test('outline geometry distinguishes outer, inner and color-region borders',()=>{
 const px=source(5,5,Array.from({length:25},(_,i)=>i===12?'#ffffff':null)).pixels;
 const count=out=>out.filter((v,i)=>i%4===3&&v).length;
 assert.equal(count(outlinePixels(px,5,5,{rgb:[0,0,0],thickness:1})),4);assert.equal(count(outlinePixels(px,5,5,{rgb:[0,0,0],thickness:2})),12);assert.equal(count(outlinePixels(px,5,5,{rgb:[0,0,0],connectivity:8})),8);
 const full=source(5,5,Array.from({length:25},(_,i)=>i%5<3?'#ff0000':'#0000ff')).pixels;
 assert.equal(count(outlinePixels(full,5,5,{rgb:[0,0,0],mode:'outer'})),0);assert.equal(count(outlinePixels(full,5,5,{rgb:[0,0,0],mode:'inner'})),16);assert.equal(count(outlinePixels(full,5,5,{rgb:[0,0,0],mode:'regions',tolerance:0})),22);
});
test('automatic outline preserves source cel, matches preview, persists and undoes',()=>{
 const e=engine(source(3,3,[null,null,null,null,'#ffffff',null,null,null,null])),before=structuredClone(e.project);
 const expected=outlinePixels(activePixels(e.project),3,3,{rgb:[18,52,86],connectivity:8,region:{x:0,y:0,width:2,height:3}});
 e.dispatch({op:'outline.auto',color:'#123456',connectivity:8,region:{x:0,y:0,width:2,height:3}});assert.deepEqual(activePixels(e.project),expected);assert.deepEqual(e.project.frames[0].cels['layer-1'],before.frames[0].cels['layer-1']);assert.equal(e.project.layers.length,2);assert.deepEqual(composite(new Engine(JSON.parse(JSON.stringify(e.project))).project),composite(e.project));validateProject(e.project);e.dispatch({op:'undo'});assert.deepEqual(e.project,before);
});
test('new editing commands reject locks and invalid parameters atomically',()=>{
 const e=engine(source(2,1,['#ff0000',null]));const commands=[{op:'color.replace',from:['#ff0000'],color:'#fff000',tolerance:-1},{op:'region.paint',x:0,y:0,color:'#ffffff',connectivity:6},{op:'outline.auto',color:'#ffffff',thickness:5},{op:'palette.mix',a:'invalid',b:'#ffffff'},{op:'palette.analyze',count:65}];
 for(const c of commands){const before=structuredClone(e.project);assert.throws(()=>e.dispatch(c));assert.deepEqual(e.project,before);}
 e.dispatch({op:'layer.update',patch:{locked:true}});for(const c of [{op:'color.replace',from:['#ff0000'],color:'#ffffff'},{op:'region.paint',x:0,y:0,color:'#ffffff'},{op:'outline.auto',color:'#ffffff'}])assert.throws(()=>e.dispatch(c),/鎖定/);
});
test('HSV picker preserves exact RGB values and preset palettes are valid independent books',()=>{
 for(const rgb of [[255,0,0],[0,255,0],[0,0,255],[128,128,128],[0,0,0],[255,255,255],[37,109,205],[212,134,81]])assert.deepEqual(hsvToRgb(...rgbToHsv(rgb)),rgb);
 const e=engine(source(1,1,[null]));assert.equal(PRESET_PALETTES.length,12);for(const p of PRESET_PALETTES)e.dispatch({op:'swatch.save',...p});validateProject(e.project);e.project.swatchBooks[1].colors[0]='#ffffff';assert.notEqual(PRESET_PALETTES[0].colors[0],'#ffffff');
});
