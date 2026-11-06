import {regionIndex,colorCandidates,oklab} from './region-guide.js';
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
const title=(v,label,max=80)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw Error(`${label}需為 1–${max} 字`);return v.trim();};
const colors=v=>{if(!Array.isArray(v)||!v.length||v.length>64||v.some(c=>typeof c!=='string'||!/^#[0-9a-f]{6}$/i.test(c)))throw Error('分類色盤需為 1–64 個 HEX 色號');return [...new Set(v.map(c=>c.toLowerCase()))];};
const rgb=hex=>hex.slice(1).match(/../g).map(c=>parseInt(c,16));
const hex=px=>'#'+px.map(v=>v.toString(16).padStart(2,'0')).join('');
export const CATEGORY_PRESETS=[['skin','皮膚'],['hair','頭髮'],['clothes','衣服'],['shadow','陰影'],['eyes','眼睛'],['accessory','配件'],['background','背景']];
export const DEFAULT_RULES={format:'bitdraw-region-rules',version:1,name:'柔和角色配色',categories:[
  {category:'skin',colors:['#75423e','#b97253','#eeb88e','#f8d8af'],mode:'nearest'},
  {category:'hair',colors:['#28203e','#514037','#9b8161','#d5bd8a'],mode:'nearest'},
  {category:'clothes',colors:['#163b30','#396250','#79b4a9','#d3e3b0'],mode:'nearest'},
  {category:'shadow',colors:['#171c2d','#303950','#52546b'],mode:'nearest'},
  {category:'eyes',colors:['#171c2d','#f1f3eb'],mode:'nearest'},
  {category:'accessory',colors:['#67544a','#c6ad76','#ebd69a'],mode:'nearest'},
  {category:'background',colors:['#292536','#38606b','#79b4a9','#d3e3b0'],mode:'nearest'}]};
export function validateRules(input){
  if(!plain(input)||input.format!=='bitdraw-region-rules'||input.version!==1)throw Error('請提供 bitdraw-region-rules v1');
  if(!Array.isArray(input.categories)||!input.categories.length||input.categories.length>32)throw Error('需有 1–32 個分類規則');
  const seen=new Set(),categories=input.categories.map(c=>{const category=title(c?.category,'分類',40);if(seen.has(category))throw Error('分類規則不可重複');seen.add(category);if(!['nearest','ramp'].includes(c.mode??'nearest'))throw Error('配色模式需為 nearest 或 ramp');return {category,colors:colors(c.colors),mode:c.mode??'nearest'};});
  return {format:'bitdraw-region-rules',version:1,name:title(input.name,'規則名稱'),categories};
}
export function labelState(p){return p.metadata?.extensions?.regionLabels??{version:1,serial:0,labels:[]};}
function mutableState(p){p.metadata??={};p.metadata.extensions??={};return p.metadata.extensions.regionLabels??={version:1,serial:0,labels:[]};}
export function indices(label){const out=[];for(const [start,length]of label.runs)for(let i=start;i<start+length;i++)out.push(i);return out;}
export function encodeMask(positions){const runs=[];for(const i of [...new Set(positions)].sort((a,b)=>a-b)){const last=runs.at(-1);if(last&&last[0]+last[1]===i)last[1]++;else runs.push([i,1]);}return runs;}
export function polygonTest(p,polygon){
  if(!Array.isArray(polygon)||polygon.length<3||polygon.length>64||polygon.some(v=>!v||!Number.isInteger(v.x)||!Number.isInteger(v.y)||v.x<0||v.y<0||v.x>p.width||v.y>p.height))throw Error('多邊形需有 3–64 個畫布邊界內整數頂點');
  return pos=>{const x=pos%p.width+.5,y=Math.floor(pos/p.width)+.5;let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;};
}
export function validateLabels(p){
  const s=p.metadata?.extensions?.regionLabels;if(s===undefined)return;
  if(!plain(s)||s.version!==1||!Number.isInteger(s.serial)||s.serial<0||!Array.isArray(s.labels)||s.labels.length>128)throw Error('命名區域資料無效');
  if(s.lastRules!==undefined)validateRules(s.lastRules);
  const ids=new Set(),used=new Map();let total=0;
  for(const l of s.labels){
    if(!/^label-[1-9]\d*$/.test(l.id)||ids.has(l.id)||Number(l.id.slice(6))>s.serial)throw Error('命名區域 ID 無效');ids.add(l.id);title(l.name,'區域名稱');title(l.category,'分類',40);
    if(!/^layer-\d+$/.test(l.layerId)||![l.width,l.height].every(n=>Number.isInteger(n)&&n>0&&n<=1024)||!Array.isArray(l.runs)||!l.runs.length||l.runs.length>1048576||typeof l.stale!=='boolean')throw Error('區域遮罩無效');
    let end=0;for(const run of l.runs){if(!Array.isArray(run)||run.length!==2||!run.every(Number.isInteger)||run[0]<end||run[1]<1||run[0]+run[1]>l.width*l.height)throw Error('區域遮罩範圍無效');end=run[0]+run[1];total+=run[1];}
    if(total>16_777_216)throw Error('命名區域總範圍過大');
    if(l.palette!==null)colors(l.palette);if(l.paletteName!==undefined&&(typeof l.paletteName!=='string'||l.paletteName.length>60))throw Error('色盤名稱無效');
    if(!l.stale){if(l.width!==p.width||l.height!==p.height||!p.layers.some(a=>a.id===l.layerId))throw Error('命名區域尺寸／圖層已失效');const owned=used.get(l.layerId)??new Set();for(const i of indices(l)){if(owned.has(i))throw Error('同層命名區域不可重疊');owned.add(i);}used.set(l.layerId,owned);}
  }
}
export function invalidateLabels(p,layerIds,reason){for(const l of labelState(p).labels)if(layerIds.includes(l.layerId)){l.stale=true;l.reason=reason;}}
export function labelSummary(p){return labelState(p).labels.map(({runs,...l})=>{const positions=indices({runs}),xs=positions.map(i=>i%l.width),ys=positions.map(i=>Math.floor(i/l.width));let x=l.width,y=l.height,right=0,bottom=0;for(let i=0;i<xs.length;i++){x=Math.min(x,xs[i]);y=Math.min(y,ys[i]);right=Math.max(right,xs[i]);bottom=Math.max(bottom,ys[i]);}return {...l,area:positions.length,bounds:{x,y,width:right-x+1,height:bottom-y+1}};});}
export function applyLabelCommand(p,c){
  const state=mutableState(p);
  if(c.op==='region.label.delete'){const index=state.labels.findIndex(l=>l.id===c.id);if(index<0)throw Error('命名區域不存在');state.labels.splice(index,1);return;}
  if(c.op==='region.label.update'){
    const l=state.labels.find(l=>l.id===c.id);if(!l)throw Error('命名區域不存在');const patch=c.patch;if(!plain(patch)||Object.keys(patch).some(k=>!['name','category','palette','paletteName'].includes(k)))throw Error('不支援的標註欄位');
    if(patch.name!==undefined)l.name=title(patch.name,'區域名稱');if(patch.category!==undefined)l.category=title(patch.category,'分類',40);if(patch.palette!==undefined)l.palette=patch.palette===null?null:colors(patch.palette);if(patch.paletteName!==undefined)l.paletteName=String(patch.paletteName).slice(0,60);return;
  }
  if(c.op!=='region.label')throw Error('未知區域標註命令');
  const layerId=c.layerId??p.activeLayerId,px=p.frames[0].cels[layerId];if(!px)throw Error('圖層不存在');
  if(c.regionIds===undefined&&c.polygon===undefined)throw Error('需提供 regionIds 或 polygon');
  if(c.regionIds!==undefined&&(!Array.isArray(c.regionIds)||!c.regionIds.length||c.regionIds.length>1024||new Set(c.regionIds).size!==c.regionIds.length))throw Error('需提供 1–1024 個不重複區域 ID');
  const index=c.regionIds?regionIndex(px,p.width,p.height,{...c,tolerance:c.tolerance??0}):null,selected=new Set(),within=c.polygon===undefined?()=>true:polygonTest(p,c.polygon);
  for(const id of c.regionIds??[]){const n=index.regions.findIndex(r=>r.id===id);if(n<0)throw Error('區域已改變，請重新分析');selected.add(n);}
  const target=c.id?state.labels.find(l=>l.id===c.id):null;if(c.id&&!target)throw Error('命名區域不存在');
  if(!target&&state.labels.length>=128)throw Error('最多 128 個命名區域');
  if(!['replace','add'].includes(c.mode??'replace'))throw Error('標註模式需為 replace 或 add');
  if(target&&c.mode==='add'&&(target.stale||target.layerId!==layerId||target.width!==p.width||target.height!==p.height))throw Error('不可擴充已失效／不同圖層區域，請以 replace 重新指定');
  const positions=[];for(let i=0;i<p.width*p.height;i++)if(px[i*4+3]&&(!index||selected.has(index.labels[i]))&&within(i))positions.push(i);
  if(!positions.length)throw Error('指定範圍沒有非透明像素');
  if(target&&c.mode==='add')positions.push(...indices(target));const mask=new Set(positions);
  for(const other of state.labels)if(other!==target&&!other.stale&&other.layerId===layerId&&indices(other).some(i=>mask.has(i)))throw Error(`範圍與「${other.name}」重疊，請先移除或重新指定該標註`);
  const l={id:target?.id??`label-${++state.serial}`,name:title(c.name??target?.name,'區域名稱'),category:title(c.category??target?.category,'分類',40),layerId,width:p.width,height:p.height,runs:encodeMask(positions),stale:false,palette:c.palette===undefined?(target?.palette??null):c.palette===null?null:colors(c.palette),paletteName:String(c.paletteName??target?.paletteName??'').slice(0,60)};
  if(target)state.labels[state.labels.indexOf(target)]=l;else state.labels.push(l);validateLabels(p);
}
export function planRules(p,command){
  const rule=validateRules(command.rules),layerId=command.layerId??p.activeLayerId,all=labelState(p).labels;
  if(command.labelIds!==undefined&&(!Array.isArray(command.labelIds)||!command.labelIds.length||new Set(command.labelIds).size!==command.labelIds.length))throw Error('labelIds 需為不重複的非空陣列');
  const selected=command.labelIds?command.labelIds.map(id=>{const l=all.find(l=>l.id===id);if(!l)throw Error('命名區域不存在');return l;}):all.filter(l=>l.layerId===layerId);
  if(!selected.length)throw Error('請先命名與分類區域');
  const result=[];
  for(const l of selected){if(l.stale||l.width!==p.width||l.height!==p.height)throw Error(`「${l.name}」標註已失效，請重新指定`);const layer=p.layers.find(a=>a.id===l.layerId);if(!layer||layer.locked||!layer.visible)throw Error(`「${l.name}」圖層需可見且未鎖定`);
    const category=rule.categories.find(r=>r.category===l.category),palette=l.palette??category?.colors;if(!palette?.length)throw Error(`分類 ${l.category} 沒有色盤，請補上規則或指定區域色盤`);
    result.push({label:l,palette,mode:category?.mode??'nearest'});
  }
  return result;
}
export function applyRules(p,c,referencePixels){
  const plan=planRules(p,c); // Validate every target before changing pixels.
  for(const {label,palette,mode}of plan){const px=p.frames[0].cels[label.layerId],positions=indices(label).filter(i=>px[i*4+3]);const cache=new Map(),reference=i=>referencePixels?.[i*4+3]?referencePixels:px;
    const light=positions.map(i=>oklab(hex(reference(i).slice(i*4,i*4+3)))[0]);let min=1,max=0;for(const v of light){min=Math.min(min,v);max=Math.max(max,v);}const ramp=palette.slice().sort((a,b)=>oklab(a)[0]-oklab(b)[0]);
    positions.forEach((i,n)=>{const old=hex(reference(i).slice(i*4,i*4+3));let mapped=cache.get(old);if(!mapped){mapped=mode==='ramp'?ramp[Math.round((max===min ? .5 : (light[n]-min)/(max-min))*(ramp.length-1))]:colorCandidates(old,palette)[0].color;cache.set(old,mapped);}px.splice(i*4,3,...rgb(mapped));});
  }
  mutableState(p).lastRules=validateRules(c.rules);
}
export function captureRules(p,name){const state=labelState(p),categories=new Map();for(const l of state.labels){if(l.stale)continue;const base=state.lastRules?.categories.find(c=>c.category===l.category),palette=l.palette??base?.colors;if(!palette)continue;const old=categories.get(l.category);if(old&&JSON.stringify(old.colors)!==JSON.stringify(palette))throw Error(`分類 ${l.category} 有不同專用色盤，請手動編輯分類規則`);categories.set(l.category,{category:l.category,colors:palette,mode:base?.mode??'nearest'});}return validateRules({format:'bitdraw-region-rules',version:1,name,categories:[...categories.values()]});}
