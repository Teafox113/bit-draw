import {samplingLayout} from './sampling.js';
import {focusCrop,detectFocus} from './auto-focus.js';
import {encodeMatte,compactGrid} from './subject-mask.js';
import {subjectOptions} from './subject-model.js';
export function compactPlan(plan){return {...plan,grid:compactGrid(plan.grid)};}
export function pixelPlan(source,{targetSize=64,width,height,fit='contain',padding=0,crop,framing,kind='auto',colors=16,preset='photo',removeBackground=false,subjectMode='fast',subjectThreshold=.5,preserveFeatures=false}={}){
  if(typeof preserveFeatures!=='boolean')throw Error('preserveFeatures 需為布林值');
  if(preserveFeatures&&(width===undefined||height===undefined))throw Error('五官優先需指定精確寬高');
  if(![false,'fast','model','quality'].includes(removeBackground))throw Error('removeBackground 需 false/fast/model/quality');
  if(removeBackground)subjectMode=removeBackground;const options=subjectOptions({subjectMode,subjectThreshold});let matte;
  if(removeBackground){if(width===undefined||height===undefined)throw Error('自動去背需指定精確寬高');const f=detectFocus(source,{kind,...options});if(f.subject.reliability==='none')throw Error('找不到可用主體，請保留背景或調整門檻');matte=encodeMatte(f.mask,f.maskWidth,f.maskHeight,f.subject.method);}
  if(framing!==undefined){if(crop)throw Error('crop 與 framing 請擇一');if(framing!=='full'&&(width===undefined||height===undefined))throw Error('自動取景需指定精確寬高');crop=focusCrop(source,framing,kind,options);}
  if(!Number.isInteger(targetSize)||targetSize<1||targetSize>1024)throw Error('目標長邊需為 1–1024');
  if(!Number.isInteger(colors)||colors<2||colors>64)throw Error('色數需為 2–64');
  if(!['photo','illustration','ai-pixel'].includes(preset))throw Error('影像預設需為 photo、illustration 或 ai-pixel');
  if(width!==undefined||height!==undefined){const output={width,height,fit,padding,...(crop?{crop}:{}),...(matte?{matte}:{})},layout=samplingLayout(source,output);return {preset,colors,width,height,layout,grid:{cellWidth:Math.max(1,Math.ceil(layout.source.width/layout.content.width)),cellHeight:Math.max(1,Math.ceil(layout.source.height/layout.content.height)),offsetX:0,offsetY:0,method:preset==='photo'?'average':'dominant',output},command:{op:'image.pixelize',width,height,fit,padding,crop,colors,preset,...(preserveFeatures?{preserveFeatures,kind}:{}),...(removeBackground?{removeBackground,subjectThreshold,kind}:{})},note:'原生寬高精確符合指定尺寸；匯出倍率預設 1。contain 保留比例並留透明邊，cover 裁切，stretch 拉伸。'};}
  const cell=Math.max(1,Math.ceil(Math.max(source.width,source.height)/targetSize));
  return {preset,targetSize,colors,width:Math.ceil(source.width/cell),height:Math.ceil(source.height/cell),grid:{cellWidth:cell,cellHeight:cell,offsetX:0,offsetY:0,method:preset==='photo'?'average':'dominant',output:null},command:{op:'image.pixelize',targetSize,colors,preset},note:'正方格取樣，長邊不超過目標；需精確尺寸請指定 width / height。'};
}
