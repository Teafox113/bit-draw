import {regionIndex,oklab} from './region-guide.js';
import {labelState,indices,encodeMask,validateLabels,polygonTest} from './semantic-regions.js';

const hex=p=>'#'+p.map(v=>v.toString(16).padStart(2,'0')).join('');
const text=(v,max=80)=>typeof v==='string'&&v.trim()&&v.length<=max;
const range=(v,a,b)=>Number.isFinite(v)&&v>=a&&v<=b;
function layerData(p,id=p.activeLayerId){const layer=p.layers.find(l=>l.id===id);if(!layer||layer.locked||!layer.visible)throw Error('區域操作需可見且未鎖定的圖層');return {id,px:p.frames[0].cels[id]};}
function adjacent(i,w,h){const a=[];if(i%w)a.push(i-1);if(i%w<w-1)a.push(i+1);if(i>=w)a.push(i-w);if(i+w<w*h)a.push(i+w);return a;}
// Deterministic binary heap; ties are broken by pixel index.
class Heap {
  a=[];
  less(a,b){return a[0]<b[0]||(a[0]===b[0]&&a[1]<b[1]);}
  push(v){let i=this.a.length;this.a.push(v);while(i){const j=(i-1)>>1;if(!this.less(v,this.a[j]))break;this.a[i]=this.a[j];i=j;}this.a[i]=v;}
  pop(){const out=this.a[0],v=this.a.pop();if(this.a.length){let i=0;while(i*2+1<this.a.length){let j=i*2+1;if(j+1<this.a.length&&this.less(this.a[j+1],this.a[j]))j++;if(!this.less(this.a[j],v))break;this.a[i]=this.a[j];i=j;}this.a[i]=v;}return out;}
}
const delta=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
export function validateRegionHints(groups){
  if(!Array.isArray(groups)||!groups.length||groups.length>32)throw Error('需有 1–32 個分類提示');let count=0;const names=new Set();
  const vertex=v=>v&&Number.isInteger(v.x)&&Number.isInteger(v.y)&&v.x>=0&&v.y>=0&&v.x<=1024&&v.y<=1024;
  for(const g of groups){if(!g||Object.keys(g).some(k=>!['name','category','points','polygon'].includes(k))||!text(g.name)||!text(g.category,40)||names.has(g.category.trim())||g.category.trim()==='unclassified')throw Error('分類提示名稱／欄位無效');names.add(g.category.trim());if(!Array.isArray(g.points)||!g.points.length||(count+=g.points.length)>256||!g.points.every(vertex))throw Error('種子需為整數座標，總數最多 256');if(g.polygon!==undefined&&(!Array.isArray(g.polygon)||g.polygon.length<3||g.polygon.length>64||!g.polygon.every(vertex)))throw Error('分類邊界需為 3–64 個整數頂點');}
  return groups;
}
export function segmentPlan(p,c={}){
  const {id:layerId,px}=layerData(p,c.layerId),w=p.width,h=p.height,n=w*h;
  const uncertainty=c.uncertainty??.08,edgeWeight=c.edgeWeight??3,spatial=c.spatial??.015;
  if(!range(uncertainty,0,.9)||!range(edgeWeight,0,20)||!range(spatial,.001,1))throw Error('uncertainty 需 0–0.9、edgeWeight 需 0–20、spatial 需 0.001–1');
  const labs=Array(n),cache=new Map();for(let i=0;i<n;i++)if(px[i*4+3]){const key=hex(px.slice(i*4,i*4+3));if(!cache.has(key))cache.set(key,oklab(key));labs[i]=cache.get(key);}
  let groups=c.groups,automatic=groups===undefined;
  if(automatic){
    const count=c.maxRegions??12;if(!Number.isInteger(count)||count<2||count>32)throw Error('maxRegions 需為 2–32');
    const rs=regionIndex(px,w,h,{tolerance:c.tolerance??16}).regions.sort((a,b)=>b.area-a.area).slice(0,count);
    groups=rs.map((r,i)=>({name:`自動區域 ${i+1}`,category:`area-${i+1}`,points:[r.seed]}));
  }
  validateRegionHints(groups);
  let totalSeeds=0;const seedOwners=new Map(),categories=new Set();
  groups=groups.map((g,k)=>{
    if(!text(g?.name)||!text(g.category,40)||g.category.trim()==='unclassified'||categories.has(g.category.trim()))throw Error('提示需有名稱與不重複分類，unclassified 為保留分類');categories.add(g.category.trim());
    if(!Array.isArray(g.points)||!g.points.length||(totalSeeds+=g.points.length)>256)throw Error('每類需有種子位置，總數最多 256');
    const within=g.polygon?polygonTest(p,g.polygon):()=>true;
    const seeds=g.points.map(v=>{if(!v||!Number.isInteger(v.x)||!Number.isInteger(v.y)||v.x<0||v.y<0||v.x>=w||v.y>=h)throw Error('種子需為畫布內整數座標');const i=v.y*w+v.x;if(!labs[i]||!within(i))throw Error('種子需位於非透明像素與該類多邊形內');if(seedOwners.has(i)&&seedOwners.get(i)!==k)throw Error('不同分類不可使用同一種子');seedOwners.set(i,k);return i;});
    return {name:g.name.trim(),category:g.category.trim(),seeds,within};
  });
  const best=new Float64Array(n).fill(Infinity),second=new Float64Array(n).fill(Infinity),owner=new Int16Array(n).fill(-1);
  for(let k=0;k<groups.length;k++){
    const g=groups[k],dist=new Float64Array(n).fill(Infinity),heap=new Heap(),prototypes=g.seeds.map(i=>labs[i]),colorCache=new Map();
    for(const i of g.seeds){dist[i]=0;heap.push([0,i]);}
    while(heap.a.length){const [cost,i]=heap.pop();if(cost!==dist[i])continue;
      for(const j of adjacent(i,w,h)){if(!labs[j]||!g.within(j))continue;let similarity=colorCache.get(labs[j]);if(similarity===undefined){similarity=Math.min(...prototypes.map(v=>delta(v,labs[j])));colorCache.set(labs[j],similarity);}
        const next=cost+spatial+edgeWeight*delta(labs[i],labs[j])+similarity*.15;
        if(next<dist[j]){dist[j]=next;heap.push([next,j]);}
      }
    }
    for(let i=0;i<n;i++)if(dist[i]<best[i]){second[i]=best[i];best[i]=dist[i];owner[i]=k;}else if(dist[i]<second[i])second[i]=dist[i];
  }
  const masks=groups.map(()=>[]),unknown=[],review=[];
  for(let i=0;i<n;i++)if(labs[i]){
    const confidence=Number.isFinite(second[i])?(second[i]-best[i])/Math.max(second[i],.000001):1;
    if(seedOwners.has(i)){owner[i]=seedOwners.get(i);masks[owner[i]].push(i);}
    else if(owner[i]<0||confidence<uncertainty){owner[i]=-1;unknown.push(i);review.push(i);}
    else masks[owner[i]].push(i);
  }
  const proposals=groups.map((g,k)=>({name:g.name,category:g.category,runs:encodeMask(masks[k]),area:masks[k].length})).filter(g=>g.area);
  if(unknown.length)proposals.push({name:'待確認',category:'unclassified',runs:encodeMask(unknown),area:unknown.length});
  return {layerId,width:w,height:h,automatic,proposals,reviewPixels:review.length,visible:labs.filter(Boolean).length,settings:{uncertainty,edgeWeight,spatial},note:automatic?'依顏色與邊界分區，area 分類待命名。':'分類來自提供的種子；信心為路徑分數差，並非語意正確機率。'};
}
export function applyAutoLabels(p,c){
  const result=segmentPlan(p,c);p.metadata??={};p.metadata.extensions??={};const state=p.metadata.extensions.regionLabels??={version:1,serial:0,labels:[]};
  if(state.labels.some(l=>l.layerId===result.layerId)&&c.replace!==true)throw Error('圖層已有標註；需明確 replace:true 才可重新分區');
  state.labels=state.labels.filter(l=>l.layerId!==result.layerId);
  for(const g of result.proposals)state.labels.push({id:`label-${++state.serial}`,name:g.name,category:g.category,layerId:result.layerId,width:p.width,height:p.height,runs:g.runs,stale:false,palette:null,paletteName:''});
  validateLabels(p);return result;
}
function getLabel(p,id){const l=labelState(p).labels.find(l=>l.id===id);if(!l||l.stale)throw Error('命名區域不存在或已失效');layerData(p,l.layerId);return l;}
function selection(p,c,px){
  if(!c.polygon&&!c.points&&!c.regionIds)throw Error('需 polygon、points 或 regionIds');
  const mask=new Set();
  if(c.polygon){const within=polygonTest(p,c.polygon);for(let i=0;i<p.width*p.height;i++)if(px[i*4+3]&&within(i))mask.add(i);}
  if(c.points){const r=c.radius??0;if(!Number.isInteger(r)||r<0||r>32||!Array.isArray(c.points)||!c.points.length||c.points.length>256)throw Error('筆刷需 1–256 點與 0–32 半徑');for(const v of c.points){if(!v||!Number.isInteger(v.x)||!Number.isInteger(v.y)||v.x<0||v.x>=p.width||v.y<0||v.y>=p.height)throw Error('筆刷座標超出畫布');for(let y=Math.max(0,v.y-r);y<=Math.min(p.height-1,v.y+r);y++)for(let x=Math.max(0,v.x-r);x<=Math.min(p.width-1,v.x+r);x++)if((x-v.x)**2+(y-v.y)**2<=r*r&&px[(y*p.width+x)*4+3])mask.add(y*p.width+x);}}
  if(c.regionIds){if(!Array.isArray(c.regionIds)||!c.regionIds.length||c.regionIds.length>1024)throw Error('需 1–1024 區域 ID');const idx=regionIndex(px,p.width,p.height,{tolerance:c.tolerance??0}),set=new Set(c.regionIds.map(id=>{const n=idx.regions.findIndex(r=>r.id===id);if(n<0)throw Error('區域已改變');return n;}));for(let i=0;i<idx.labels.length;i++)if(set.has(idx.labels[i]))mask.add(i);}
  return mask;
}
function components(mask,w,h){const remaining=new Set(mask),parts=[];while(remaining.size){const first=remaining.values().next().value,q=[first];remaining.delete(first);for(let k=0;k<q.length;k++)for(const j of adjacent(q[k],w,h))if(remaining.delete(j))q.push(j);parts.push(q);}return parts.sort((a,b)=>b.length-a.length);}
function assign(p,l,mask,overlap='reject'){
  if(!['reject','transfer'].includes(overlap))throw Error('overlap 需 reject 或 transfer');
  const state=labelState(p);for(const other of state.labels)if(other!==l&&!other.stale&&other.layerId===l.layerId){const old=indices(other),left=old.filter(i=>!mask.has(i));if(left.length!==old.length){if(overlap==='reject')throw Error(`與「${other.name}」重疊；指定 transfer 才能移轉`);other.runs=encodeMask(left);}}
  l.runs=encodeMask(mask);state.labels=state.labels.filter(v=>v.runs.length);validateLabels(p);
}
export function applyMask(p,c){
  const l=getLabel(p,c.id),state=labelState(p),{px}=layerData(p,l.layerId),w=p.width,h=p.height;let mask=new Set(indices(l));
  if(c.action==='constrain'){
    const other=getLabel(p,c.outsideId);if(other===l||other.layerId!==l.layerId)throw Error('outsideId 需為同層其他有效區域');const keep=selection(p,c,px),removed=[...mask].filter(i=>!keep.has(i));l.runs=encodeMask([...mask].filter(i=>keep.has(i)));other.runs=encodeMask([...indices(other),...removed]);state.labels=state.labels.filter(v=>v.runs.length);validateLabels(p);return;
  }
  if(c.action==='merge'){
    if(!Array.isArray(c.ids)||!c.ids.length||c.ids.length>128||new Set(c.ids).size!==c.ids.length||c.ids.includes(l.id))throw Error('merge 需不重複的其他 label IDs');
    const others=c.ids.map(id=>getLabel(p,id));if(others.some(v=>v.layerId!==l.layerId))throw Error('合併需同一圖層');for(const other of others)for(const i of indices(other))mask.add(i);state.labels=state.labels.filter(v=>!others.includes(v));assign(p,l,mask);return;
  }
  if(['add','subtract','intersect','split'].includes(c.action)){
    const sel=selection(p,c,px);
    if(c.action==='add')for(const i of sel)mask.add(i);
    if(c.action==='subtract')mask=new Set([...mask].filter(i=>!sel.has(i)));
    if(c.action==='intersect')mask=new Set([...mask].filter(i=>sel.has(i)));
    if(c.action==='split'){
      const part=[...mask].filter(i=>sel.has(i));if(!part.length||part.length===mask.size)throw Error('拆分需選中部分區域');if(!text(c.name)||!text(c.category,40))throw Error('拆分需名稱與分類');if(state.labels.length>=128)throw Error('最多 128 區域');
      for(const i of part)mask.delete(i);l.runs=encodeMask(mask);state.labels.push({...l,id:`label-${++state.serial}`,name:c.name.trim(),category:c.category.trim(),runs:encodeMask(part),palette:null,paletteName:''});validateLabels(p);return;
    }
  }else if(['grow','shrink'].includes(c.action)){
    const radius=c.radius??1;if(!Number.isInteger(radius)||radius<1||radius>16)throw Error('擴張／收縮半徑需 1–16');
    for(let k=0;k<radius;k++){const next=new Set(mask);for(const i of mask){const ns=adjacent(i,w,h);if(c.action==='grow'){for(const j of ns)if(px[j*4+3])next.add(j);}else if(ns.length<4||ns.some(j=>!mask.has(j)))next.delete(i);}mask=next;}
  }else if(c.action==='fillHoles'){
    const inverse=new Set();for(let i=0;i<w*h;i++)if(!mask.has(i))inverse.add(i);
    for(const part of components(inverse,w,h))if(!part.some(i=>i%w===0||i%w===w-1||i<w||i>=w*(h-1)))for(const i of part)if(px[i*4+3])mask.add(i);
  }else if(c.action==='keepLargest')mask=new Set(components(mask,w,h)[0]??[]);
  else throw Error('未知遮罩修正操作');
  assign(p,l,mask,c.overlap);
}
