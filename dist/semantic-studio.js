import {LocalLibrary} from './recovery.js';
import {CATEGORY_PRESETS,DEFAULT_RULES,validateRules,labelState,labelSummary,indices,captureRules,planRules} from './semantic-regions.js';
import {pixelPlan,compactPlan} from './pixel-plan.js';
import {segmentPlan} from './auto-regions.js';

export function initSemantic({workspace,request,message,getSelection}){
  // Separate DB keeps older open 0.5 tabs' recipe/backup schemas compatible.
  const library=new LocalLibrary('bitdraw-region-rules'),$=id=>document.getElementById(id);
  let ruleId=null,updated=null,labelsReport=null,previewKey=null,rows=structuredClone(DEFAULT_RULES.categories);
  const show=r=>$('semanticResult').textContent=typeof r==='string'?r:JSON.stringify(r,null,2);
  const safe=fn=>async()=>{try{await fn();}catch(e){show(e.message);message(e.message,true);}};
  async function listRules(){return library.transact(['recipes'],'readonly',(tx,done)=>{const r=tx.objectStore('recipes').getAll();r.onsuccess=()=>done(r.result.map(x=>({id:x.id,name:x.name,updated:x.updated,categories:x.categories.map(c=>({category:c.category,colors:c.colors.length,mode:c.mode}))})));});}
  async function getRule(id){const r=await library.getRecipe(id);if(!r)throw Error('規則不存在');validateRules(r);return r;}
  async function handle(r){
    if(['document.segmentPlan','document.labelAtlas'].includes(r.action)){
      if(typeof r.documentId!=='string')throw Error('需明確指定 documentId');const d=workspace.get(r.documentId),p=d.engine.project;
      if(r.expectedRevision!==d.revision)throw Error('版本衝突，請重新 inspect');
      if(r.action==='document.segmentPlan'){const plan=segmentPlan(p,r);return {ok:true,id:d.id,revision:d.revision,...plan,proposals:plan.proposals.map(({runs,...v})=>v)};}
      const selected=labelState(p).labels.filter(l=>!l.stale&&l.layerId===(r.layerId??p.activeLayerId));if(!selected.length)throw Error('目前圖層尚無有效標註');
      const scale=Math.max(1,Math.floor(512/Math.max(p.width,p.height))),out=document.createElement('canvas');out.width=p.width*scale;out.height=p.height*scale;const ctx=out.getContext('2d'),legend=[];
      selected.forEach((l,k)=>{const color=l.category==='unclassified'?'#ff4670':`hsl(${k*137.508%360} 65% 55%)`,list=indices(l);ctx.fillStyle=color;for(const i of list)ctx.fillRect(i%p.width*scale,Math.floor(i/p.width)*scale,scale,scale);const cx=list.reduce((a,i)=>a+i%p.width,0)/list.length,cy=list.reduce((a,i)=>a+Math.floor(i/p.width),0)/list.length;let center=list[0],distance=Infinity;for(const i of list){const v=(i%p.width-cx)**2+(Math.floor(i/p.width)-cy)**2;if(v<distance){distance=v;center=i;}}const x=(center%p.width+.5)*scale,y=(Math.floor(center/p.width)+.5)*scale;ctx.font='bold 14px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=3;ctx.strokeStyle='#111';ctx.strokeText(String(k+1),x,y);ctx.fillStyle='#fff';ctx.fillText(String(k+1),x,y);legend.push({number:k+1,id:l.id,name:l.name,category:l.category,area:list.length});});
      return {ok:true,id:d.id,revision:d.revision,width:out.width,height:out.height,legend,png:out.toDataURL('image/png').split(',')[1]};
    }
    if(['document.labels','document.labelPreview','document.rules.capture','document.pixelPlan','document.sourcePreview'].includes(r.action)&&typeof r.documentId!=='string')throw Error('需明確指定 documentId');
    if(r.action==='rule.list')return {ok:true,rules:await listRules()};
    if(r.action==='rule.get')return {ok:true,rules:await getRule(r.ruleId)};
    if(r.action==='rule.save'){
      const rules=validateRules(r.rules),id=r.ruleId??crypto.randomUUID();if(typeof id!=='string'||id.length>100)throw Error('規則 ID 無效');if(r.ruleId&&!Number.isInteger(r.expectedUpdated))throw Error('更新規則需 expectedUpdated');
      const record={...rules,id,updated:Math.max(Date.now(),(r.expectedUpdated??0)+1)};await library.putRecipe(record,r.expectedUpdated,!!r.ruleId);return {ok:true,id,name:record.name,updated:record.updated,categories:record.categories.length};
    }
    if(r.action==='rule.delete'){if(typeof r.ruleId!=='string')throw Error('缺少 ruleId');await library.deleteRecipe(r.ruleId);return {ok:true};}
    if(r.action==='rule.run'){
      if(typeof r.documentId!=='string')throw Error('需明確指定 documentId');const rule=await getRule(r.ruleId);if(r.expectedUpdated!==rule.updated)throw Error('規則版本衝突，請重新 rule.get');
      const d=workspace.get(r.documentId),command={op:'region.rules.apply',rules:validateRules(rule),layerId:r.layerId,labelIds:r.labelIds,reference:r.reference};
      const targets=planRules(d.engine.project,command).map(({label,palette,mode})=>({id:label.id,name:label.name,category:label.category,colors:palette.length,mode}));
      return {...await request({action:'document.apply',documentId:d.id,expectedRevision:r.expectedRevision,dryRun:r.dryRun,commands:[command]}),ruleId:rule.id,ruleUpdated:rule.updated,targets};
    }
    if(r.action==='document.labels'){const d=workspace.get(r.documentId);return {ok:true,id:d.id,revision:d.revision,labels:labelSummary(d.engine.project)};}
    if(r.action==='document.rules.capture'){const d=workspace.get(r.documentId);return {ok:true,id:d.id,revision:d.revision,rules:captureRules(d.engine.project,r.name??'目前分類配色')};}
    if(r.action==='document.pixelPlan'){const d=workspace.get(r.documentId);return {ok:true,id:d.id,revision:d.revision,...compactPlan(pixelPlan(d.engine.project.source,r)),next:['document.apply: image.pixelize','document.sourcePreview / document.regions','document.apply: region.label','rule.run dryRun / commit','document.save / document.export']};}
    if(['document.labelPreview','document.sourcePreview'].includes(r.action)){
      const d=workspace.get(r.documentId),p=d.engine.project;let width,height,pixels;
      if(r.action==='document.sourcePreview'){({width,height,pixels}=p.source);}
      else {if(r.expectedRevision!==d.revision)throw Error('版本衝突，請重新讀取標註');const l=labelState(p).labels.find(l=>l.id===r.labelId);if(!l||l.stale)throw Error('標註不存在或已失效');width=p.width;height=p.height;pixels=p.frames[0].cels[l.layerId].slice();const mask=new Set(indices(l));for(let i=0;i<width*height;i++)if(mask.has(i))pixels.splice(i*4,4,255,70,160,255);else pixels[i*4+3]=Math.round(pixels[i*4+3]*.15);}
      const maxSize=r.maxSize??512;if(!Number.isInteger(maxSize)||maxSize<64||maxSize>1024)throw Error('預覽長邊需為 64–1024');
      const source=document.createElement('canvas');source.width=width;source.height=height;source.getContext('2d').putImageData(new ImageData(Uint8ClampedArray.from(pixels),width,height),0,0);
      const out=document.createElement('canvas'),scale=Math.min(1,maxSize/Math.max(width,height));out.width=Math.max(1,Math.round(width*scale));out.height=Math.max(1,Math.round(height*scale));out.getContext('2d').imageSmoothingEnabled=r.action==='document.sourcePreview';out.getContext('2d').drawImage(source,0,0,out.width,out.height);
      return {ok:true,id:d.id,revision:d.revision,width:out.width,height:out.height,png:out.toDataURL('image/png').split(',')[1]};
    }
    return undefined;
  }
  function books(select,inherit='依分類規則'){const selected=select.value;select.replaceChildren(new Option(inherit,''),...workspace.get().engine.project.swatchBooks.map(b=>new Option(`${b.name} · ${b.colors.length} 色`,b.id)));select.value=selected;}
  function paletteInput(select){if(select.value==='__keep')return {};if(!select.value)return {palette:null,paletteName:''};const b=workspace.get().engine.project.swatchBooks.find(b=>b.id===select.value);if(!b)throw Error('色盤不存在');return {palette:b.colors,paletteName:b.name};}
  async function refreshLabels(){
    labelsReport=await request({action:'document.labels',documentId:workspace.activeId});$('semanticLabels').replaceChildren();$('labelTarget').replaceChildren(new Option('建立新命名區域',''),...labelsReport.labels.map(l=>new Option(`${l.name} · ${l.category}${l.stale?' · 已失效':''}`,l.id)));books($('semanticBook'));
    $('semanticBook').prepend(new Option('保留此區域原有設定','__keep'));$('semanticBook').value='__keep';$('semanticMask').hidden=true;
    for(const l of labelsReport.labels){const row=document.createElement('div');row.className='semantic-label-row';const b=document.createElement('button');b.textContent=`${l.name} · ${l.category} · ${l.area} px · ${l.palette?l.paletteName||l.palette.length+' 色':'分類規則'}${l.stale?' · 已失效':''}`;b.onclick=safe(async()=>{$('labelTarget').value=l.id;$('semanticName').value=l.name;$('semanticCategory').value=l.category;show(l);if(!l.stale){const v=await request({action:'document.labelPreview',documentId:labelsReport.id,expectedRevision:labelsReport.revision,labelId:l.id});$('semanticMask').src='data:image/png;base64,'+v.png;$('semanticMask').hidden=false;}});row.append(b);$('semanticLabels').append(row);}
    if(!labelsReport.labels.length)$('semanticLabels').textContent='尚無標註。先在區域助手選取色塊，再於下方儲存名稱與分類。';
  }
  async function refreshRules(){const list=await listRules();$('ruleSelect').replaceChildren(new Option('選擇已儲存規則',''),...list.map(r=>new Option(`${r.name} · ${r.categories.length} 類`,r.id)));$('ruleSelect').value=ruleId??'';}
  function renderRows(){
    $('ruleRows').replaceChildren();for(const row of rows){const wrap=document.createElement('div');wrap.className='rule-row';const category=document.createElement('input');category.value=row.category;category.maxLength=40;category.setAttribute('aria-label','分類 ID');category.oninput=()=>row.category=category.value;
      const palette=document.createElement('input');palette.value=row.colors.join(' ');palette.setAttribute('aria-label',`${row.category} 色盤 HEX`);palette.oninput=()=>row.colors=palette.value.trim().split(/[\s,]+/).filter(Boolean);
      const book=document.createElement('select');books(book,'由工作色盤帶入');book.setAttribute('aria-label',`${row.category} 工作色盤`);book.onchange=()=>{if(book.value){const p=paletteInput(book);row.colors=p.palette.slice();palette.value=row.colors.join(' ');}};
      const mode=document.createElement('select');mode.add(new Option('最近色','nearest'));mode.add(new Option('明暗階映射','ramp'));mode.value=row.mode;mode.setAttribute('aria-label',`${row.category} 配色模式`);mode.onchange=()=>row.mode=mode.value;
      const del=document.createElement('button');del.textContent='×';del.setAttribute('aria-label',`移除 ${row.category} 規則`);del.onclick=()=>{rows=rows.filter(v=>v!==row);renderRows();};wrap.append(category,palette,book,mode,del);$('ruleRows').append(wrap);
    }
  }
  function currentRules(){return validateRules({format:'bitdraw-region-rules',version:1,name:$('ruleName').value,categories:rows});}
  function loadRules(r){$('ruleName').value=r.name;rows=structuredClone(r.categories);renderRows();previewKey=null;}
  $('semanticRefresh').onclick=safe(async()=>{await refreshLabels();await refreshRules();renderRows();});
  $('semanticSection').addEventListener('toggle',()=>{if($('semanticSection').open)safe(async()=>{await refreshLabels();await refreshRules();renderRows();})()});
  $('semanticCategoryList').replaceChildren(...CATEGORY_PRESETS.map(([id,name])=>new Option(name,id)));
  $('labelTarget').onchange=()=>{const l=labelsReport?.labels.find(l=>l.id===$('labelTarget').value);if(l){$('semanticName').value=l.name;$('semanticCategory').value=l.category;show(l);}};
  $('labelSelected').onclick=safe(async()=>{
    const {regionResult,selectedRegion}=getSelection();if(!selectedRegion||!regionResult)throw Error('先在區域助手分析並選取色塊');if(regionResult.id!==workspace.activeId)throw Error('目前文件已切換，請重新選取區域');
    const id=$('labelTarget').value||undefined,command={op:'region.label',id,mode:$('labelAdd').checked?'add':'replace',layerId:regionResult.layerId,regionIds:[selectedRegion.id],...regionResult.settings,name:$('semanticName').value,category:$('semanticCategory').value,...paletteInput($('semanticBook'))};
    show(await request({action:'document.apply',documentId:regionResult.id,expectedRevision:regionResult.revision,commands:[command]}));await refreshLabels();
  });
  for(const [id,op]of [['labelUpdate','region.label.update'],['labelDelete','region.label.delete']])$(id).onclick=safe(async()=>{
    const labelId=$('labelTarget').value;if(!labelId||!labelsReport)throw Error('請選擇已命名區域');const patch={name:$('semanticName').value,category:$('semanticCategory').value,...paletteInput($('semanticBook'))};
    if(labelsReport.id!==workspace.activeId)throw Error('目前文件已切換，請重新讀取標註');
    show(await request({action:'document.apply',documentId:labelsReport.id,expectedRevision:labelsReport.revision,commands:[{op,id:labelId,...(op.endsWith('update')?{patch}:{})}]}));await refreshLabels();
  });
  $('ruleName').value=DEFAULT_RULES.name;renderRows();
  $('ruleSelect').onchange=safe(async()=>{ruleId=$('ruleSelect').value||null;if(ruleId){const rule=await getRule(ruleId);updated=rule.updated;loadRules(rule);}});
  $('ruleNew').onclick=()=>{ruleId=null;updated=null;$('ruleSelect').value='';loadRules(DEFAULT_RULES);};
  $('ruleAddCategory').onclick=()=>{rows.push({category:'custom',colors:workspace.get().engine.project.swatchBooks.find(b=>b.id===workspace.get().engine.project.activeBookId).colors.slice(0,64),mode:'nearest'});renderRows();};
  $('ruleSave').onclick=safe(async()=>{const r=await handle({action:'rule.save',ruleId,expectedUpdated:updated,rules:currentRules()});ruleId=r.id;updated=r.updated;await refreshRules();show(r);});
  $('ruleCapture').onclick=safe(async()=>{const r=await request({action:'document.rules.capture',documentId:workspace.activeId,name:$('ruleName').value});ruleId=null;updated=null;$('ruleSelect').value='';loadRules(r.rules);show('已讀取目前分類色盤，請儲存規則。');});
  for(const [id,dryRun]of [['rulePreview',true],['ruleApply',false]])$(id).onclick=safe(async()=>{
    if(!ruleId)throw Error('請先儲存規則');const stored=await getRule(ruleId);if(JSON.stringify(validateRules(stored))!==JSON.stringify(currentRules()))throw Error('規則有未儲存修改');
    const d=workspace.get(),key=JSON.stringify([d.id,d.revision,d.engine.project.activeLayerId,ruleId,updated]);if(!dryRun&&previewKey!==key)throw Error('請先預演；文件或規則變動後需重新預演');
    show(await request({action:'rule.run',documentId:d.id,expectedRevision:d.revision,ruleId,expectedUpdated:updated,dryRun}));previewKey=dryRun?key:null;await refreshLabels();
  });
  $('ruleExport').onclick=safe(()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(currentRules(),null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='categories.bitdraw-rules.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  $('ruleImport').onclick=()=>$('ruleFile').click();$('ruleFile').onchange=safe(async()=>{const f=$('ruleFile').files[0];$('ruleFile').value='';if(!f)return;if(f.size>100000)throw Error('規則檔案上限 100 KB');const r=validateRules(JSON.parse(await f.text()));ruleId=null;updated=null;$('ruleSelect').value='';loadRules(r);show('已載入，請儲存規則。');});
  let pixelPreview=null,finishPreview=null,focusPreview=null;
  $('focusAnalyze').onclick=safe(async()=>{const d=workspace.get(),kind=$('focusKind').value,subjectMode=$('subjectMode').value,subjectThreshold=Number($('subjectThreshold').value),r=await request({action:'document.focusPreview',documentId:d.id,expectedRevision:d.revision,kind,subjectMode,subjectThreshold});focusPreview=JSON.stringify([d.id,d.revision,kind,$('subjectMode').value,$('subjectThreshold').value]);$('focusAtlas').src='data:image/png;base64,'+r.png;$('focusAtlas').hidden=false;$('focusResult').textContent=`偵測 ${r.faces.length} 張臉 · ${r.protect.length} 個保護範圍 · 主體 ${({alpha:'透明輪廓','border-colour':'邊緣色差',u2netp:'輕量模型輪廓',u2net:'精細模型輪廓',empty:'空白圖片'})[r.subject.method]} / ${r.subject.reliability==='high'?'輪廓明確':'需核對'}${r.review?' · 需核對':''}`;});
  $('focusApply').onclick=safe(async()=>{const d=workspace.get(),kind=$('focusKind').value;if(focusPreview!==JSON.stringify([d.id,d.revision,kind,$('subjectMode').value,$('subjectThreshold').value]))throw Error('請先分析目前圖片');await request({action:'document.apply',documentId:d.id,expectedRevision:d.revision,commands:[{op:'image.autoFocus',kind,subjectMode:$('subjectMode').value,subjectThreshold:Number($('subjectThreshold').value)}]});focusPreview=null;$('focusResult').textContent='已保存自動保護範圍，可繼續修整或手動調整。';});
  $('pixelSizePreset').onchange=()=>{const v=$('pixelSizePreset').value;if(v.includes(',')){const [w,h]=v.split(',');$('pixelWidth').value=w;$('pixelHeight').value=h;$('pixelPadding').value=Number(w)>=180?'10':'2';}pixelPreview=null;};
  for(const [id,dryRun]of [['finishPreview',true],['finishApply',false]])$(id).onclick=safe(async()=>{const d=workspace.get(),command={op:'image.finish',...($('finishAuto').checked?{autoProtect:true,kind:$('focusKind').value}:{protect:JSON.parse($('finishProtect').value)}),restoreDetails:$('finishDetails').checked,detailMode:$('finishDetailMode').value,despeckle:$('finishClean').checked?{maxArea:Number($('finishArea').value),passes:Number($('finishPasses').value)}:false,outline:$('finishOutline').checked?{style:$('finishStyle').value,geometry:$('finishGeometry').value,light:$('finishLight').value,lightColor:$('finishLightColor').value,mode:$('finishOutlineMode').value,color:$('finishOutlineColor').value,thickness:Number($('finishThickness').value)}:false},key=JSON.stringify([d.id,d.revision,command]);if(!dryRun&&finishPreview!==key)throw Error('請先預演修整');const r=await request({action:'document.apply',documentId:d.id,expectedRevision:d.revision,dryRun,commands:[command]});finishPreview=dryRun?key:null;$('finishResult').textContent=`${dryRun?'預演':'完成'} · 清理 ${r.finish.cleaned} px · 描邊 ${r.finish.outlined} px · 細節 ${r.finish.details} px`;});
  for(const [id,dryRun]of [['pixelQuickPreview',true],['pixelQuickApply',false]])$(id).onclick=safe(async()=>{
    const d=workspace.get(),command={op:'image.pixelize',preset:$('pixelPreset').value,framing:$('pixelFraming').value,kind:$('focusKind').value,preserveFeatures:$('pixelSizePreset').value!=='legacy'&&$('pixelFeatures').checked,removeBackground:$('pixelBackground').value==='keep'?false:$('pixelBackground').value,subjectThreshold:Number($('subjectThreshold').value),targetSize:Number($('pixelTarget').value),...($('pixelSizePreset').value==='legacy'?{}:{width:Number($('pixelWidth').value),height:Number($('pixelHeight').value),fit:$('pixelFit').value,padding:Number($('pixelPadding').value)}),colors:Number($('pixelColors').value)},key=JSON.stringify([d.id,d.revision,command]);if(!dryRun&&pixelPreview!==key)throw Error('請先預演像素化');
    const result=await request({action:'document.apply',documentId:d.id,expectedRevision:d.revision,dryRun,commands:[command]});pixelPreview=dryRun?key:null;const plan=command.width!==undefined?command:pixelPlan(d.engine.project.source,command);$('pixelQuickResult').textContent=`${dryRun?'預計輸出':'已輸出'} ${plan.width} × ${plan.height} px · 最多 ${plan.colors} 色\n原圖 ${d.engine.project.source.width} × ${d.engine.project.source.height} px → 原生 ${plan.width} × ${plan.height} px · ${result.changes.pixels} 個合成像素變更`;message(dryRun?'像素化預演完成；確認尺寸後可套用。':'像素化已完成，接著可分析與命名區域。');
  });
  let autoPreview=null,maskPreview=null,maskReport=null;
  async function refreshMasks(){const d=workspace.get(),ls=labelSummary(d.engine.project).filter(l=>!l.stale&&l.layerId===d.engine.project.activeLayerId),select=$('maskTarget'),old=select.value;maskReport={id:d.id,revision:d.revision,layerId:d.engine.project.activeLayerId};select.replaceChildren(...ls.map(l=>new Option(`${l.id} · ${l.name} · ${l.area} px`,l.id)));if(ls.some(l=>l.id===old))select.value=old;$('autoRegionAtlas').hidden=true;if(ls.length){const r=await handle({action:'document.labelAtlas',documentId:d.id,expectedRevision:d.revision});$('autoRegionAtlas').src='data:image/png;base64,'+r.png;$('autoRegionAtlas').hidden=false;}}
  const autoSafe=fn=>safe(async()=>{try{await fn();}catch(e){$('autoRegionResult').textContent=e.message;throw e;}});
  $('autoRegionRefresh').onclick=autoSafe(refreshMasks);
  $('autoRegionSection').addEventListener('toggle',()=>{if($('autoRegionSection').open)autoSafe(refreshMasks)();});
  for(const [id,dryRun]of [['autoRegionPreview',true],['autoRegionApply',false]])$(id).onclick=autoSafe(async()=>{
    const d=workspace.get(),command={op:'region.autolabel',layerId:d.engine.project.activeLayerId,maxRegions:Number($('autoRegionCount').value),uncertainty:Number($('autoRegionUncertainty').value),replace:$('autoRegionReplace').checked};if($('autoRegionMode').value==='guided')command.groups=JSON.parse($('autoRegionGroups').value);
    const key=JSON.stringify([d.id,d.revision,command]);if(!dryRun&&autoPreview!==key)throw Error('請先預演；文件或參數變動後需重新預演');const r=await request({action:'document.apply',documentId:d.id,expectedRevision:d.revision,dryRun,commands:[command]});autoPreview=dryRun?key:null;$('autoRegionResult').textContent=`${dryRun?'預計建立':'已建立'} ${r.labels.length} 個區域\n`+r.labels.map(l=>`${l.id} · ${l.name} · ${l.area} px`).join('\n');if(!dryRun)await refreshMasks();
  });
  for(const [id,dryRun]of [['maskPreview',true],['maskApply',false]])$(id).onclick=autoSafe(async()=>{
    const d=workspace.get();if(!maskReport||maskReport.id!==d.id||maskReport.revision!==d.revision||maskReport.layerId!==d.engine.project.activeLayerId)throw Error('文件或圖層已變動，請更新遮罩清單');const extra=JSON.parse($('maskSelection').value);if(!extra||typeof extra!=='object'||Array.isArray(extra)||Object.keys(extra).some(k=>!['points','polygon','regionIds','tolerance','name','category','ids','outsideId'].includes(k)))throw Error('修正參數欄位無效');const command={...extra,op:'region.mask',id:$('maskTarget').value,action:$('maskAction').value,radius:Number($('maskRadius').value),overlap:$('maskTransfer').checked?'transfer':'reject'},key=JSON.stringify([d.id,d.revision,command]);if(!dryRun&&maskPreview!==key)throw Error('請先預演遮罩');const r=await request({action:'document.apply',documentId:d.id,expectedRevision:d.revision,dryRun,commands:[command]});maskPreview=dryRun?key:null;$('autoRegionResult').textContent=`${dryRun?'預演完成':'遮罩已更新'}；圖片色彩保留\n`+r.labels.map(l=>`${l.id} · ${l.name} · ${l.area} px`).join('\n');if(!dryRun)await refreshMasks();
  });
  return {handle,refresh:async()=>{if($('autoRegionSection').open)await refreshMasks();if($('semanticSection').open){await refreshLabels();await refreshRules();renderRows();}}};
}
