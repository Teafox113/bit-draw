import {segmentRegions,regionOptions} from './color-tools.js';
const hex=rgb=>'#'+rgb.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
// Geometry identity deliberately excludes color; edits still require a document revision.
export function regionIndex(pixels,width,height,options={}) {
  const settings=regionOptions(options),result=segmentRegions(pixels,width,height,settings);
  const stats=result.regions.map(()=>({hash:2166136261,sum:[0,0,0],min:[255,255,255],max:[0,0,0],adjacent:new Set()}));
  for(let i=0;i<result.labels.length;i++){
    const label=result.labels[i];if(label<0)continue;const s=stats[label];
    s.hash=Math.imul(s.hash^i,16777619)>>>0;
    for(let k=0;k<3;k++){const v=pixels[i*4+k];s.sum[k]+=v;s.min[k]=Math.min(s.min[k],v);s.max[k]=Math.max(s.max[k],v);}
    for(const n of [i%width<width-1?i+1:-1,i+width<width*height?i+width:-1])if(n>=0&&result.labels[n]>=0&&result.labels[n]!==label){s.adjacent.add(result.labels[n]);stats[result.labels[n]].adjacent.add(label);}
  }
  const regions=result.regions.map((r,i)=>({id:`r-${width}x${height}-${r.seed.y*width+r.seed.x}-${r.area}-${stats[i].hash.toString(16)}`,area:r.area,bounds:{x:r.x,y:r.y,width:r.width,height:r.height},seed:r.seed,mean:hex(stats[i].sum.map(v=>v/r.area)),spread:Math.max(...stats[i].max.map((v,k)=>v-stats[i].min[k]))}));
  regions.forEach((r,i)=>r.neighbors=[...stats[i].adjacent].map(j=>regions[j].id));
  return {...result,regions,settings};
}
export function oklab(hexColor){
  const [r,g,b]=hexColor.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b),m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b),s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
  return [.2104542553*l+.793617785*m-.0040720468*s,1.9779984951*l-2.428592205*m+.4505937099*s,.0259040371*l+.7827717662*m-.808675766*s];
}
export function colorCandidates(color,colors){
  const a=oklab(color);return colors.map((c,index)=>({index,color:c,distance:Math.round(Math.hypot(...oklab(c).map((v,k)=>v-a[k]))*10000)/100})).sort((a,b)=>a.distance-b.distance).slice(0,3);
}
export function inspectRegions(project,{layerId=project.activeLayerId,bookId=project.activeBookId,offset=0,limit=24,...options}={}){
  if(!project.layers.some(l=>l.id===layerId))throw Error('圖層不存在');
  const book=project.swatchBooks.find(b=>b.id===bookId);if(!book)throw Error('色盤不存在');
  if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)throw Error('offset 需非負整數，limit 需為 1–100');
  const index=regionIndex(project.frames[0].cels[layerId],project.width,project.height,{...options,tolerance:options.tolerance??0});
  const regions=index.regions.slice().sort((a,b)=>b.area-a.area).slice(offset,offset+limit).map(r=>{
    const candidates=colorCandidates(r.mean,book.colors),ambiguous=!candidates.length||candidates[0].distance>12||(candidates[1]&&candidates[1].distance-candidates[0].distance<2);
    return {...r,neighborCount:r.neighbors.length,neighbors:r.neighbors.slice(0,12),candidates,review:ambiguous||r.spread>40,command:{op:'region.paintVerified',layerId,regionId:r.id,x:r.seed.x,y:r.seed.y,...index.settings,color:candidates[0]?.color??r.mean}};
  });
  return {layerId,bookId,settings:index.settings,total:index.regions.length,offset,next:offset+limit<index.regions.length?offset+limit:null,regions,note:'候選為 OKLab 色距 ×100，不代表語意正確；透明區域不參與，neighbors 為四向接觸。'};
}
