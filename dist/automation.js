import {LocalLibrary,BackupCoordinator,backupSummary} from './recovery.js';
import {validateRecipe,resolveRecipe} from './recipes.js';
import {COMMANDS} from './workspace.js';
import {inspectRegions,regionIndex} from './region-guide.js';
import {initSemantic} from './semantic-studio.js';

export function initAutomation({workspace,capture,busy,restore,request,message}){
  const library=new LocalLibrary(),owner=crypto.randomUUID(),backups=new BackupCoordinator(library,owner),$=id=>document.getElementById(id);
  let saving=false,lastError='',recipeId=null,recipeUpdated=null,regionResult=null,selectedRegion=null,recipePreview=null;
  const semantic=initSemantic({workspace,request,message,getSelection:()=>({regionResult,selectedRegion})});
  const status=text=>$('backupStatus').textContent=text;
  async function flush(force=false){
    if(busy())throw Error('請先完成筆畫或檔案操作');capture();saving=true;
    try{const result=await backups.flush(workspace.documents,{force});if(result.saved){status('備份 '+new Date(result.time).toLocaleTimeString());lastError='';}return result;}
    catch(error){status('備份失敗 · 請儲存專案');if(lastError!==error.message){message('自動備份失敗：'+error.message+'。請下載專案保存。',true);lastError=error.message;}throw error;}
    finally{saving=false;}
  }
  setInterval(()=>{if(!saving&&!busy())flush().catch(()=>{});},2000);
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&!busy())flush().catch(()=>{});});
  async function handle(r){
    const semanticResult=await semantic.handle(r);if(semanticResult!==undefined)return semanticResult;
    if(['document.regions','document.regionPreview'].includes(r.action)&&typeof r.documentId!=='string')throw Error('需明確指定 documentId');
    if(r.action==='backup.list')return {ok:true,backups:await library.listBackups(),owner};
    if(r.action==='backup.flush')return flush(true);
    if(r.action==='backup.restore'){
      const b=await library.getBackup(r.backupId);if(!b)throw Error('備份不存在');
      const id=restore(b.project,b.snapshot.view);return {ok:true,...workspace.inspect(id),recoveredFrom:backupSummary(b.snapshot),historyRestored:false};
    }
    if(r.action==='backup.delete'){if(typeof r.backupId!=='string')throw Error('缺少 backupId');await library.deleteBackup(r.backupId);return {ok:true};}
    if(r.action==='recipe.list')return {ok:true,recipes:await library.listRecipes()};
    if(r.action==='recipe.save'){
      const recipe=validateRecipe(r.recipe,COMMANDS),id=r.recipeId??crypto.randomUUID();
      if(typeof id!=='string'||id.length>100)throw Error('流程 ID 無效');
      if(r.recipeId&&!Number.isInteger(r.expectedUpdated))throw Error('更新流程需指定 expectedUpdated');
      const item={...recipe,id,updated:Math.max(Date.now(),(r.expectedUpdated??0)+1)};await library.putRecipe(item,r.recipeId?r.expectedUpdated:undefined,!!r.recipeId);
      return {ok:true,id,name:item.name,updated:item.updated,steps:item.commands.length};
    }
    if(r.action==='recipe.get'){const recipe=await library.getRecipe(r.recipeId);if(!recipe)throw Error('流程不存在');return {ok:true,recipe};}
    if(r.action==='recipe.delete'){if(typeof r.recipeId!=='string')throw Error('缺少 recipeId');await library.deleteRecipe(r.recipeId);return {ok:true};}
    if(r.action==='recipe.run'){
      const recipe=await library.getRecipe(r.recipeId);if(!recipe)throw Error('流程不存在');
      if(r.expectedUpdated!==recipe.updated)throw Error('流程版本已變動，請重新 recipe.get');
      const commands=resolveRecipe(recipe,r.values??{},COMMANDS);
      return {...await request({action:'document.apply',documentId:r.documentId,expectedRevision:r.expectedRevision,dryRun:r.dryRun,commands}),recipeId:recipe.id,recipeUpdated:recipe.updated};
    }
    if(r.action==='document.regions'){
      const d=workspace.get(r.documentId);return {ok:true,id:d.id,revision:d.revision,...inspectRegions(d.engine.project,r)};
    }
    if(r.action==='document.regionPreview'){
      const d=workspace.get(r.documentId),p=d.engine.project;if(r.expectedRevision!==d.revision)throw Error('版本衝突，請重新分析區域');
      const layerId=r.layerId??p.activeLayerId,px=p.frames[0].cels[layerId];if(!px)throw Error('圖層不存在');
      const index=regionIndex(px,p.width,p.height,r),label=index.regions.findIndex(v=>v.id===r.regionId);if(label<0)throw Error('區域不存在，請重新分析');
      const pixels=Uint8ClampedArray.from(px);for(let i=0;i<index.labels.length;i++){if(index.labels[i]!==label)pixels[i*4+3]=Math.round(pixels[i*4+3]*.15);else pixels.set([255,70,160,255],i*4);}
      const c=document.createElement('canvas');c.width=p.width;c.height=p.height;c.getContext('2d').putImageData(new ImageData(pixels,p.width,p.height),0,0);
      return {ok:true,id:d.id,revision:d.revision,regionId:r.regionId,width:p.width,height:p.height,png:c.toDataURL('image/png').split(',')[1]};
    }
    return undefined;
  }
  const safe=fn=>async()=>{try{await fn();}catch(e){$('automationResult').textContent=e.message;message(e.message,true);}};
  const output=r=>$('automationResult').textContent=JSON.stringify(r,null,2);
  const download=(obj,name)=>{const url=URL.createObjectURL(new Blob([JSON.stringify(obj,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  async function refreshBackups(){
    const {backups:items}=await handle({action:'backup.list'});$('backupList').replaceChildren();
    for(const b of items){const row=document.createElement('div');row.className='library-row';const text=document.createElement('span');text.textContent=`${b.name} · ${b.width}×${b.height} · r${b.revision} · ${new Date(b.time).toLocaleString()}`;
      const load=document.createElement('button');load.textContent='復原至新分頁';load.onclick=safe(async()=>{output(await handle({action:'backup.restore',backupId:b.id}));$('automationDialog').close();message('已復原至獨立分頁；請儲存專案。');});
      const del=document.createElement('button');del.textContent='刪除此備份';del.onclick=safe(async()=>{await handle({action:'backup.delete',backupId:b.id});await refreshBackups();});row.append(text,load,del);$('backupList').append(row);
    }
    if(!items.length)$('backupList').textContent='尚無備份。開始編輯後會自動建立。';
    $('recoveryNotice').hidden=!items.some(b=>b.owner!==owner);$('recoveryNotice').textContent=`有 ${items.filter(b=>b.owner!==owner).length} 份其他工作階段的復原版本，點此檢視`;
  }
  async function refreshRecipes(){
    const items=await library.listRecipes();$('recipeSelect').replaceChildren(new Option('選擇已儲存流程',''),...items.map(r=>new Option(`${r.name} · ${r.steps} 步`,r.id)));$('recipeSelect').value=recipeId??'';
  }
  const blank={format:'bitdraw-recipe',version:1,name:'統一局部色彩',description:'修改 from / to 參數後預演，確認範圍再套用。',parameters:{from:{type:'color',default:'#c7e68c'},to:{type:'color',default:'#88aa62'}},commands:[{op:'color.replace',from:[{$param:'from'}],color:{$param:'to'},tolerance:0}]};
  $('recipeDefinition').value=JSON.stringify(blank,null,2);$('recipeValues').value='{}';
  $('automationOpen').onclick=$('recoveryNotice').onclick=safe(async()=>{$('automationDialog').showModal();await refreshBackups();await refreshRecipes();await semantic.refresh();});
  $('backupNow').onclick=safe(async()=>{output(await flush(true));await refreshBackups();});
  $('recipeSelect').onchange=safe(async()=>{recipeId=$('recipeSelect').value||null;const recipe=recipeId?await library.getRecipe(recipeId):blank;recipeUpdated=recipe.updated??null;$('recipeDefinition').value=JSON.stringify(recipe,null,2);$('recipeValues').value='{}';});
  $('recipeNew').onclick=()=>{recipeId=null;recipeUpdated=null;$('recipeSelect').value='';$('recipeDefinition').value=JSON.stringify(blank,null,2);};
  $('recipeSave').onclick=safe(async()=>{const r=await handle({action:'recipe.save',recipeId,expectedUpdated:recipeUpdated,recipe:JSON.parse($('recipeDefinition').value)});recipeId=r.id;recipeUpdated=r.updated;await refreshRecipes();output(r);});
  $('recipeExport').onclick=safe(async()=>download(validateRecipe(JSON.parse($('recipeDefinition').value),COMMANDS),'workflow.bitdraw-recipe.json'));
  $('recipeImport').onclick=()=>$('recipeFile').click();
  $('recipeFile').onchange=safe(async()=>{const f=$('recipeFile').files[0];$('recipeFile').value='';if(!f)return;if(f.size>200000)throw Error('流程檔案上限 200 KB');const recipe=validateRecipe(JSON.parse(await f.text()),COMMANDS);recipeId=null;recipeUpdated=null;$('recipeSelect').value='';$('recipeDefinition').value=JSON.stringify(recipe,null,2);output({ok:true,message:'已載入，請儲存至流程庫'});});
  for(const [id,dryRun]of [['recipePreview',true],['recipeRun',false]])$(id).onclick=safe(async()=>{
    if(!recipeId)throw Error('請先儲存流程');const current=await library.getRecipe(recipeId);
    if(JSON.stringify(validateRecipe(JSON.parse($('recipeDefinition').value),COMMANDS))!==JSON.stringify(validateRecipe(current,COMMANDS)))throw Error('流程有未儲存修改，請先儲存');
    const d=workspace.get(),values=JSON.parse($('recipeValues').value),key=JSON.stringify([d.id,d.revision,recipeId,recipeUpdated,values]);
    if(!dryRun&&recipePreview!==key)throw Error('請先預演流程；文件、流程或參數變更後需重新預演');
    const result=await request({action:'recipe.run',recipeId,expectedUpdated:recipeUpdated,documentId:d.id,expectedRevision:d.revision,dryRun,values});recipePreview=dryRun?key:null;output(result);
  });
  $('regionAnalyze').onclick=safe(async()=>{
    const d=workspace.get();regionResult=await request({action:'document.regions',documentId:d.id,tolerance:Number($('guideTolerance').value),connectivity:Number($('guideConnectivity').value),offset:Number($('guideOffset').value),limit:24});selectedRegion=null;$('regionMask').hidden=true;$('guideRegions').replaceChildren();$('guideCandidates').replaceChildren();
    for(const region of regionResult.regions){const b=document.createElement('button');b.textContent=`${region.id} · ${region.area} px · ${region.mean}${region.review?' · 需判讀':''}`;b.onclick=safe(async()=>{
      selectedRegion=region;setGuideColor(region.command.color);$('guideCandidates').replaceChildren(...region.candidates.map(c=>{const choice=document.createElement('button');choice.textContent=`色卡 ${c.index+1} · ${c.color} · 色距 ${c.distance}`;choice.style.borderLeft=`8px solid ${c.color}`;choice.onclick=()=>setGuideColor(c.color);return choice;}));output({id:region.id,bounds:region.bounds,neighbors:region.neighbors,candidates:region.candidates,review:region.review});
      const preview=await request({action:'document.regionPreview',documentId:regionResult.id,expectedRevision:regionResult.revision,layerId:regionResult.layerId,regionId:region.id,...regionResult.settings});$('regionMask').src='data:image/png;base64,'+preview.png;$('regionMask').hidden=false;
    });$('guideRegions').append(b);}
    output({total:regionResult.total,revision:regionResult.revision,next:regionResult.next,note:regionResult.note});
  });
  function setGuideColor(color){$('guideColor').value=color;$('guideHex').value=color;}
  $('guideColor').oninput=()=>setGuideColor($('guideColor').value);
  $('guideHex').onchange=safe(()=>{if(!/^#[0-9a-f]{6}$/i.test($('guideHex').value))throw Error('色號需為 #RRGGBB');setGuideColor($('guideHex').value);});
  for(const [id,dryRun]of [['guidePreview',true],['guideApply',false]])$(id).onclick=safe(async()=>{
    if(!selectedRegion)throw Error('請先分析並選取區域');
    if(!/^#[0-9a-f]{6}$/i.test($('guideHex').value))throw Error('色號需為 #RRGGBB');setGuideColor($('guideHex').value);
    output(await request({action:'document.apply',documentId:regionResult.id,expectedRevision:regionResult.revision,dryRun,commands:[{...selectedRegion.command,color:$('guideColor').value}]}));
    if(!dryRun){selectedRegion=null;message('區域已填色；如需再修改，請重新分析。');}
  });
  refreshBackups().catch(e=>{status('備份無法啟用');message(e.message,true);});
  return {handle,flush};
}
