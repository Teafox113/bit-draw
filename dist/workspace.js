import {compactGrid} from './subject-mask.js';
import {Engine, composite, activePixels, analyzeSource, toHex} from './core.js';
import {labelState,labelSummary} from './semantic-regions.js';
export const COMMANDS=['image.autoFocus','detail.protect','image.finish','image.cutout','image.pipeline','region.autolabel','region.mask','image.pixelize','region.label','region.label.update','region.label.delete','region.rules.apply','project.rename','grid.set','rebuild','palette.reduce','palette.map','palette.analyze','palette.mix','color.replace','region.paint','region.paintVerified','outline.auto','paint.stroke','paint.rect','paint.line','erase.stroke','fill','undo','redo','layer.add','layer.duplicate','layer.select','layer.update','layer.move','layer.delete','layer.mergeDown','swatch.save','swatch.replace','swatch.select','swatch.delete','adjust','outline','selection.clear'];
export function changeSummary(before,after,w,h) {
  if(before.width!==w||before.height!==h)return {resized:true,pixels:w*h,bounds:{x:0,y:0,width:w,height:h}};
  let count=0,x0=w,y0=h,x1=-1,y1=-1;
  for(let i=0;i<w*h;i++)if(after.slice(i*4,i*4+4).some((v,k)=>v!==before.pixels[i*4+k])){count++;const x=i%w,y=Math.floor(i/w);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
  return {resized:false,pixels:count,bounds:count?{x:x0,y:y0,width:x1-x0+1,height:y1-y0+1}:null};
}
export class Workspace {
  constructor(){this.documents=[];this.activeId=null;this.serial=0;}
  get(id=this.activeId){const d=this.documents.find(d=>d.id===id);if(!d)throw Error('文件不存在，請重新列出文件');return d;}
  add(project,{dirty=false}={}){if(this.documents.length>=8)throw Error('最多開啟 8 份文件，請先儲存並關閉部分分頁');const engine=new Engine(project);const d={id:`doc-${++this.serial}`,engine,dirty,revision:0,view:{}};this.documents.push(d);this.activeId=d.id;return d;}
  select(id){this.get(id);this.activeId=id;}
  close(id,{discard=false}={}){const d=this.get(id);if(d.dirty&&!discard)throw Error('文件尚未儲存');if(this.documents.length===1)throw Error('請至少保留一份文件');const i=this.documents.indexOf(d);this.documents.splice(i,1);if(this.activeId===id)this.activeId=this.documents[Math.min(i,this.documents.length-1)].id;}
  touch(id=this.activeId){const d=this.get(id);d.revision++;d.dirty=true;}
  list(){return this.documents.map(d=>({id:d.id,name:d.engine.project.name,width:d.engine.project.width,height:d.engine.project.height,revision:d.revision,dirty:d.dirty,active:d.id===this.activeId}));}
  inspect(id=this.activeId){const d=this.get(id),p=d.engine.project,labels=labelState(p).labels;return {...this.list().find(v=>v.id===id),source:{width:p.source.width,height:p.source.height},grid:compactGrid(p.grid),activeLayerId:p.activeLayerId,layers:p.layers.map(l=>({...l})),activeBookId:p.activeBookId,books:p.swatchBooks.map(b=>({id:b.id,name:b.name,count:b.colors.length})),colors:p.palette.length,palette:p.palette.slice(0,16),namedRegions:{count:labels.length,stale:labels.filter(l=>l.stale).length,categories:[...new Set(labels.map(l=>l.category))]},undo:d.engine.history.length,redo:d.engine.future.length};}
  readRegion(id,r,layerId){const d=this.get(id),p=d.engine.project;
    if(!r||![r.x,r.y,r.width,r.height].every(Number.isInteger)||r.x<0||r.y<0||r.width<1||r.height<1||r.x+r.width>p.width||r.y+r.height>p.height||r.width*r.height>4096)throw Error('讀取區域需在畫布內且最多 4096 像素');
    if(layerId&&!p.layers.some(l=>l.id===layerId))throw Error('圖層不存在');
    const pixels=layerId?p.frames[0].cels[layerId]:composite(p),colors=[],index=new Map(),runs=[];
    for(let y=r.y;y<r.y+r.height;y++)for(let x=r.x;x<r.x+r.width;x++){const i=(y*p.width+x)*4,key=toHex(pixels.slice(i,i+3))+pixels[i+3].toString(16).padStart(2,'0');if(!index.has(key)){index.set(key,colors.length);colors.push(key);}const n=index.get(key),last=runs.at(-1);if(last&&last[0]===n)last[1]++;else runs.push([n,1]);}
    return {id,revision:d.revision,region:r,encoding:'row-major palette RLE; colors=#RRGGBBAA; runs=[colorIndex,length]',colors,runs};
  }
  apply(id,commands,{expectedRevision,dryRun=false}={}){
    const d=this.get(id),e=d.engine;if(expectedRevision!==undefined&&expectedRevision!==d.revision)throw Error(`版本衝突：預期 ${expectedRevision}，目前 ${d.revision}，請重新讀取`);
    if(!Array.isArray(commands)||!commands.length||commands.length>1000)throw Error('需提供 1–1000 筆指令');
    if(commands.length>1&&commands.some(c=>['undo','redo'].includes(c?.op)))throw Error('復原／重做需單獨執行');
    const snapshot=e.snapshot(),history=e.history.slice(),future=e.future.slice(),before={width:e.project.width,height:e.project.height,pixels:composite(e.project)};
    try{
      for(const c of commands)e.dispatch(c);
      const changes=changeSummary(before,composite(e.project),e.project.width,e.project.height);
      const summary={ok:true,id,revision:d.revision+(dryRun?0:1),dryRun,commands:commands.length,changes,layers:e.project.layers.length,colors:e.project.palette.length};
      if(commands.some(c=>c.op.startsWith('region.label')||['region.autolabel','region.mask','image.pipeline'].includes(c.op)))summary.labels=labelSummary(e.project).map(({id,name,category,area,stale})=>({id,name,category,area,stale}));
      if(commands.some(c=>c.preserveFeatures))summary.features=e.project.metadata?.extensions?.featureSampling;
      if(commands.some(c=>c.removeBackground))summary.subject=compactGrid(e.project.grid).output?.matte;
      if(commands.some(c=>c.op==='image.finish'||c.finish))summary.finish=e.project.metadata?.extensions?.lastFinish;
      if(commands.some(c=>c.op==='image.autoFocus'||c.autoProtect||c.finish?.autoProtect))summary.focus=e.project.metadata?.extensions?.autoFocus;
      if(dryRun){e.restore(snapshot);e.history=history;e.future=future;return summary;}
      if(commands.length>1){e.history=[...history,snapshot].slice(-32);e.future=[];while(e.history.length>1&&e.history.reduce((n,s)=>n+s.width*s.height*4*s.layers.length,0)>8_388_608)e.history.shift();}
      this.touch(id);return summary;
    }catch(error){e.restore(snapshot);e.history=history;e.future=future;throw error;}
  }
}
export const capabilities=()=>({version:'0.11.0',protocol:1,actions:['document.focusPreview','document.focus','document.segmentPlan','document.labelAtlas','rule.list','rule.get','rule.save','rule.run','rule.delete','document.labels','document.labelPreview','document.rules.capture','document.pixelPlan','document.sourcePreview','backup.list','backup.flush','backup.restore','backup.delete','recipe.list','recipe.get','recipe.save','recipe.run','recipe.delete','document.regions','document.regionPreview','capabilities','documents.list','document.inspect','document.readRegion','document.palette','document.apply','document.create','document.import','document.activate','document.view','document.open','document.save','document.export','document.markSaved'],commands:COMMANDS,limits:{documents:8,layers:16,width:1024,height:1024,readRegionPixels:4096,batch:1000,namedRegions:128,ruleCategories:32,categoryColors:64,polygonVertices:64},apply:{required:['documentId','expectedRevision','commands'],optional:['dryRun']},transport:'authenticated loopback HTTP / live browser bridge / file CLI'});
