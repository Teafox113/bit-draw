import {Engine} from './core.js';
import {Workspace} from './workspace.js';
import {packProject,unpackProject} from './project-codec.js';
import {loadFaceModel,detectFocus,projectFocus,focusSummary} from './auto-focus.js';
import {pixelPlan,compactPlan} from './pixel-plan.js';
import {prepareSubject,prepareCommands} from './subject-model.js';
const sources=new Map();
const ready=fetch(new URL('./vendor/facefinder',import.meta.url)).then(r=>{if(!r.ok)throw Error('本機辨識模型載入失敗');return r.arrayBuffer();}).then(loadFaceModel);
ready.catch(()=>{});
let queue=Promise.resolve();self.onmessage=({data:m})=>{queue=queue.then(()=>handle(m));};
async function handle(m){const start=performance.now();try{if(m.task==='drop'){sources.delete(m.sourceKey);return;}if(m.task==='unpack'){self.postMessage({id:m.id,result:await unpackProject(m.input),ms:performance.now()-start});return;}if(m.source)sources.set(m.sourceKey,m.source);const source=sources.get(m.sourceKey);if(!source)throw Error('背景來源已失效，請重開文件');const p={...m.project,source};let result;
 if(m.task==='pack')result=await packProject(p);
 else if(m.task==='plan'){await ready;await prepareCommands(source,[m.options]);result=compactPlan(pixelPlan(source,m.options));}
 else if(m.task==='focus'){await ready;if(['model','quality','anime'].includes(m.options.subjectMode))await prepareSubject(source,m.options.subjectMode);const f=detectFocus(source,m.options);result={...focusSummary(f),protect:projectFocus(p,f).protect,subjectBounds:projectFocus(p,f).subjectBounds,...(m.options.preview?{previewMask:{width:f.maskWidth,height:f.maskHeight,pixels:f.mask}}:{})};}
 else if(m.task==='apply'){await ready;await prepareCommands(source,m.commands);const e=Object.create(Engine.prototype);Object.assign(e,{project:p,history:[],future:[]});const w=new Workspace();w.documents=[{id:m.documentId,engine:e,revision:m.revision,dirty:false,view:{}}];w.activeId=m.documentId;const summary=w.apply(m.documentId,m.commands,{expectedRevision:m.revision});const {source:omit,...project}=e.project;result={summary,project};}
 else throw Error('未知背景工作');self.postMessage({id:m.id,result,ms:performance.now()-start});
 }catch(error){self.postMessage({id:m.id,error:error.message});}};
