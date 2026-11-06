import {labelState,indices,polygonTest} from './semantic-regions.js';
import {protectionMask,validateProtect} from './sampling.js';
import {styledOutline} from './outline-styles.js';
const neighbors=(i,w,h)=>[i%w?i-1:-1,i%w<w-1?i+1:-1,i>=w?i-w:-1,i+w<w*h?i+w:-1];
const key=(px,i)=>px[i*4]*65536+px[i*4+1]*256+px[i*4+2];
const rgb=n=>[n>>16,(n>>8)&255,n&255];
function selection(p,labelIds){const selected=new Uint8Array(p.width*p.height);if(!Array.isArray(labelIds)||!labelIds.length||labelIds.length>128||new Set(labelIds).size!==labelIds.length)throw Error('需 1–128 個不同的 labelIds');for(const id of labelIds){const l=labelState(p).labels.find(l=>l.id===id);if(!l||l.stale||l.layerId!==p.activeLayerId)throw Error('請選擇目前圖層的有效標註');for(const i of indices(l))selected[i]=1;}return selected;}
export function validateProtection(p){const saved=p.metadata?.extensions?.detailProtection;if(saved){if(saved.width!==p.width||saved.height!==p.height)throw Error('細節保護尺寸失效');validateProtect(saved.regions,p.width,p.height);}}
export function setProtection(p,regions){validateProtect(regions,p.width,p.height);p.metadata??={};p.metadata.extensions??={};p.metadata.extensions.detailProtection={width:p.width,height:p.height,regions:structuredClone(regions)};}
export function cutout(p,c){const px=p.frames[0].cels[p.activeLayerId],mask=c.labelIds?selection(p,c.labelIds):null,within=c.polygon?polygonTest(p,c.polygon):null;if(!mask&&!within)throw Error('去背需 labelIds 或 polygon');for(let i=0;i<p.width*p.height;i++)if((mask&&!mask[i])||(within&&!within(i)))px.fill(0,i*4,i*4+4);}
export function finishPixels(p,c,detailPixels){
  for(const name of ['despeckle','outline'])if(c[name]!==undefined&&c[name]!==false&&(!c[name]||typeof c[name]!=='object'||Array.isArray(c[name])))throw Error(`${name} 需為設定物件或 false`);
  if(c.restoreDetails!==undefined&&typeof c.restoreDetails!=='boolean')throw Error('restoreDetails 需為布林值');
  const w=p.width,h=p.height,n=w*h,px=p.frames[0].cels[p.activeLayerId],regions=c.protect??p.metadata?.extensions?.detailProtection?.regions??[],protectedMask=protectionMask(regions,w,h),stats={cleaned:0,outlined:0,details:0,protectedPixels:protectedMask.reduce((a,v)=>a+v,0)};
  const labels=new Int16Array(n).fill(-1),state=labelState(p),liveLabels=state.labels.filter(l=>!l.stale&&l.layerId===p.activeLayerId);liveLabels.forEach((l,k)=>{for(const i of indices(l))labels[i]=k;});
  if(c.despeckle!==undefined&&c.despeckle!==false){const o=c.despeckle,max=o.maxArea??2,passes=o.passes??1;if(!Number.isInteger(max)||max<1||max>32||!Number.isInteger(passes)||passes<1||passes>3)throw Error('雜點面積需 1–32、次數需 1–3');
    for(let pass=0;pass<passes;pass++){const before=px.slice(),seen=new Uint8Array(n);for(let i=0;i<n;i++){if(seen[i]||!before[i*4+3])continue;const color=key(before,i),owner=labels[i],part=[i];seen[i]=1;for(let k=0;k<part.length;k++)for(const j of neighbors(part[k],w,h))if(j>=0&&!seen[j]&&before[j*4+3]&&labels[j]===owner&&key(before,j)===color){seen[j]=1;part.push(j);}if(part.length>max||part.some(j=>protectedMask[j]))continue;
      const boundary=new Map();let touchesOther=false;for(const j of part)for(const v of neighbors(j,w,h)){if(v<0||!before[v*4+3]||labels[v]!==owner){touchesOther=true;continue;}const k=key(before,v);if(k!==color)boundary.set(k,(boundary.get(k)??0)+1);}if(touchesOther)continue;let best,count=0;for(const [k,v]of boundary)if(v>count){best=k;count=v;}const total=[...boundary.values()].reduce((a,v)=>a+v,0);if(best===undefined||count<2||count/total<.5)continue;for(const j of part){px.splice(j*4,3,...rgb(best));stats.cleaned++;}
    }}
  }
  if(c.restoreDetails){if(!detailPixels||!regions.length)throw Error('細節還原需先指定 protect 矩形');
    const colors=new Map();for(let i=0;i<n;i++)if(px[i*4+3])colors.set(key(px,i),rgb(key(px,i)));const candidates=[...colors.values()];if(candidates.length>4096)throw Error('請先縮色再還原細節');
    const labelPalettes=liveLabels.map(l=>(l.palette??state.lastRules?.categories.find(c=>c.category===l.category)?.colors)?.map(hex=>rgb(parseInt(hex.slice(1),16))));
    for(let i=0;i<n;i++)if(protectedMask[i]&&px[i*4+3]&&detailPixels[i*4+3]){const src=detailPixels.slice(i*4,i*4+3);let best,score=Infinity;for(const color of labelPalettes[labels[i]]??candidates){const d=(color[0]-src[0])**2*2+(color[1]-src[1])**2*4+(color[2]-src[2])**2;if(d<score){score=d;best=color;}}if(best?.some((v,k)=>v!==px[i*4+k])){px.splice(i*4,3,...best);stats.details++;}}
  }
  if(c.outline!==undefined&&c.outline!==false){const o=c.outline,mask=o.labelIds?selection(p,o.labelIds):Uint8Array.from({length:n},(_,i)=>px[i*4+3]?1:0);stats.outlined=styledOutline(p,px,o,mask,protectedMask);}
  if(c.protect!==undefined)setProtection(p,regions);p.metadata??={};p.metadata.extensions??={};p.metadata.extensions.lastFinish=stats;return stats;
}
