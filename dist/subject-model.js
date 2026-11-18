import {animeInput,animeOutput} from './anime-input.js';
// Local inference only. Coalesce requests per immutable source and model.
const sessions=new Map(),predictions=new WeakMap();
export function modelInput(source,size=320){
 const n=size*size,data=new Float32Array(n*3),mean=[.485,.456,.406],std=[.229,.224,.225],p=source.pixels;let max=0;
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const sx=Math.max(0,Math.min(source.width-1,(x+.5)*source.width/size-.5)),sy=Math.max(0,Math.min(source.height-1,(y+.5)*source.height/size-.5)),x0=Math.floor(sx),y0=Math.floor(sy),fx=sx-x0,fy=sy-y0;
  for(let c=0;c<3;c++){let value=0;for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){const i=(Math.min(source.height-1,y0+dy)*source.width+Math.min(source.width-1,x0+dx))*4,a=p[i+3]/255;value+=(p[i+c]*a+255*(1-a))*(dx?fx:1-fx)*(dy?fy:1-fy);}data[c*n+y*size+x]=value;max=Math.max(max,value);}
 }
 for(let c=0;c<3;c++)for(let i=0;i<n;i++)data[c*n+i]=(data[c*n+i]/Math.max(1,max)-mean[c])/std[c];return data;
}
async function runtime(mode){
 let sessionPromise=sessions.get(mode);
 if(!sessionPromise)sessionPromise=(async()=>{const node=typeof process!=='undefined'&&process.versions?.node,ort=await import('./vendor/ort/ort.wasm.min.mjs');ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;
  const filename=mode==='anime'?'isnet-anime':mode==='quality'?'u2net':'u2netp';
  let model;if(node){const {readFile}=await import('node:fs/promises');model=await readFile(new URL('./vendor/'+filename+'.onnx',import.meta.url));}else model=new URL('./vendor/'+filename+'.onnx',import.meta.url).href;
  const session=await ort.InferenceSession.create(model,{executionProviders:['wasm'],graphOptimizationLevel:'all'});return {ort,session};})();
 sessions.set(mode,sessionPromise);try{return await sessionPromise;}catch(e){sessions.delete(mode);throw Error('本機去背模型載入失敗：'+e.message);}
}
export async function prepareSubject(source,mode='model'){
 subjectOptions({subjectMode:mode});
 // Match the existing alpha-first analysis exactly; transparent art does not need neural inference.
 const scale=Math.min(1,320/Math.max(source.width,source.height)),aw=Math.max(1,Math.round(source.width*scale)),ah=Math.max(1,Math.round(source.height*scale));let opaque=0;
 for(let y=0;y<ah;y++)for(let x=0;x<aw;x++){const i=(Math.min(source.height-1,Math.floor((y+.5)/ah*source.height))*source.width+Math.min(source.width-1,Math.floor((x+.5)/aw*source.width)))*4;opaque+=source.pixels[i+3]>=128?1:0;}if(opaque<aw*ah*.98)return {skipped:'source-alpha'};
 const entries=predictions.get(source)??new Map();predictions.set(source,entries);if(entries.has(mode))return entries.get(mode);
 const pending=(async()=>{const start=performance.now(),{ort,session}=await runtime(mode),anime=mode==='anime'?animeInput(source):null,size=anime?1024:320,input=new ort.Tensor('float32',anime?.data??modelInput(source),[1,3,size,size]);let outputs;
  try{outputs=await session.run({[session.inputNames[0]]:input});const raw=outputs[session.outputNames[0]].data;let result;
   if(anime)result=animeOutput(raw,anime.layout,source);
   else{const probability=new Float32Array(320*320);let min=Infinity,max=-Infinity;for(const v of raw){min=Math.min(min,v);max=Math.max(max,v);}for(let i=0;i<probability.length;i++)probability[i]=max-min>1e-6?(raw[i]-min)/(max-min):0;result={probability,width:320,height:320};}
   result.ms=Math.round(performance.now()-start);entries.set(mode,result);return result;
  }finally{input.dispose();if(outputs)for(const tensor of Object.values(outputs))tensor.dispose();}
 })();entries.set(mode,pending);try{return await pending;}catch(e){entries.delete(mode);throw e;}
}
export function subjectOptions({subjectMode='fast',subjectThreshold=.5}={}){if(!['fast','model','quality','anime'].includes(subjectMode)||!Number.isFinite(subjectThreshold)||subjectThreshold<.1||subjectThreshold>.9)throw Error('主體模式需 fast/model/quality/anime，門檻需 0.1–0.9');return {subjectMode,subjectThreshold};}
export function modelSubject(source,threshold=.5,mode='model'){
 const result=predictions.get(source)?.get(mode);if(!result?.probability)throw Error('主體模型尚未準備，請使用背景指令或 CLI');
 const {width:w,height:h,probability}=result,mask=new Uint8Array(w*h);let uncertain=0,area=0;
 for(let i=0;i<mask.length;i++){const x=i%w,y=Math.floor(i/w),s=(Math.min(source.height-1,Math.floor((y+.5)/h*source.height))*source.width+Math.min(source.width-1,Math.floor((x+.5)/w*source.width)))*4;if(source.pixels[s+3]<128)continue;mask[i]=probability[i]>=threshold?1:0;area+=mask[i];if(probability[i]>.2&&probability[i]<.8)uncertain++;}
 return {mask,width:w,height:h,method:mode==='anime'?'isnet-anime':mode==='quality'?'u2net':'u2netp',reliability:area>mask.length*.002&&area<mask.length*.98?'review':'none',uncertainFraction:Math.round(uncertain/mask.length*1000)/1000,inferenceMs:result.ms};
}
export async function prepareCommands(source,commands){for(const c of commands){for(const mode of new Set([c.removeBackground,c.subjectMode,c.finish?.subjectMode]))if(['model','quality','anime'].includes(mode))await prepareSubject(source,mode);}}
