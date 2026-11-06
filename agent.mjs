import {readFile,writeFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {capabilities} from './dist/workspace.js';
const args=process.argv.slice(2);
async function readJson(file){if((await stat(file)).size>160*1024*1024)throw Error('JSON file exceeds 160 MB');return JSON.parse(await readFile(file,'utf8'));}
async function main(){
  if(args[0]==='help'){console.log(JSON.stringify({usage:'node agent.mjs sessions | SESSION list | SESSION inspect DOC | SESSION focus DOC options.json | SESSION regions DOC [options.json] | SESSION labels DOC | SESSION segment-plan DOC options.json | SESSION atlas DOC output.png | SESSION rules | SESSION rule ID [output.json] | SESSION rule-save rules.json | SESSION rule-run run.json | SESSION pixel-plan DOC [options.json] | SESSION source DOC output.png | SESSION recipes | SESSION recipe ID [output.json] | SESSION recipe-save recipe.json | SESSION run request.json | SESSION backups | SESSION backup | SESSION restore BACKUP_ID | SESSION apply request.json | SESSION request request.json [outputPath] | SESSION open project.json | SESSION import image.png | SESSION save DOC output.json | SESSION export DOC output.png',...capabilities()}));return;}
  const runtime=JSON.parse(await readFile(new URL('./.bitdraw-runtime.json',import.meta.url),'utf8'));
  const call=async(route,data)=>{const res=await fetch(runtime.url+'/api/'+route,{method:data?'POST':'GET',headers:{Authorization:'Bearer '+runtime.token,'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});const result=await res.json();if(!res.ok||result.ok===false){const e=Error(result.error||'Request failed');e.uncertain=result.uncertain;throw e;}return result;};
  if(args[0]==='sessions'){console.log(JSON.stringify(await call('sessions')));return;}
  const [sessionId,action,arg,output]=args;
  if(!sessionId||!action)throw Error('Usage: node agent.mjs sessions | <sessionId> <list|inspect|apply|request|open|save|export> [documentId or request.json or project.json] [outputPath]');
  let request;
  if(action==='list')request={action:'documents.list'};
  else if(action==='recipes')request={action:'recipe.list'};
  else if(action==='segment-plan'){const inspect=await call('request',{sessionId,request:{action:'document.inspect',documentId:arg}});request={...(output?await readJson(output):{}),action:'document.segmentPlan',documentId:arg,expectedRevision:inspect.revision};}
  else if(action==='atlas'){const inspect=await call('request',{sessionId,request:{action:'document.inspect',documentId:arg}});request={action:'document.labelAtlas',documentId:arg,expectedRevision:inspect.revision};}
  else if(action==='labels')request={action:'document.labels',documentId:arg};
  else if(action==='rules')request={action:'rule.list'};
  else if(action==='rule')request={action:'rule.get',ruleId:arg};
  else if(action==='rule-save')request={action:'rule.save',rules:await readJson(arg)};
  else if(action==='rule-run')request={...await readJson(arg),action:'rule.run'};
  else if(action==='pixel-plan')request={...(output?await readJson(output):{}),action:'document.pixelPlan',documentId:arg};
  else if(action==='source'){if(!output)throw Error('Output PNG path required');request={action:'document.sourcePreview',documentId:arg};}
  else if(action==='recipe')request={action:'recipe.get',recipeId:arg};
  else if(action==='recipe-save')request={action:'recipe.save',recipe:await readJson(arg)};
  else if(action==='run')request={...await readJson(arg),action:'recipe.run'};
  else if(action==='backups')request={action:'backup.list'};
  else if(action==='backup')request={action:'backup.flush'};
  else if(action==='restore')request={action:'backup.restore',backupId:arg};
  else if(action==='regions')request={...(output?await readJson(output):{}),action:'document.regions',documentId:arg};
  else if(action==='focus'){const opts=output?await readJson(output):{};request={...opts,action:'document.focus',documentId:arg};}
  else if(action==='inspect')request={action:'document.inspect',documentId:arg};
  else if(action==='apply'||action==='request')request=await readJson(arg);
  else if(action==='open')request={action:'document.open',project:await readJson(arg)};
  else if(action==='import'){const mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'}[path.extname(arg).toLowerCase()];if(!mime)throw Error('Only PNG/JPG/WebP');if((await stat(arg)).size>20*1024*1024)throw Error('Image exceeds 20 MB');request={action:'document.import',name:path.basename(arg),mime,data:(await readFile(arg)).toString('base64')};}
  else if(action==='save'||action==='export'){if(!output)throw Error('Output path required');request={action:'document.'+action,documentId:arg};}
  else throw Error('Unknown action');
  const result=await call('request',{sessionId,request});
  if(action==='save'){
    // Only acknowledge saved after the requested disk write succeeds.
    await writeFile(output,JSON.stringify(result.project));const ack=await call('request',{sessionId,request:{action:'document.markSaved',documentId:arg,expectedRevision:result.revision}});
    console.log(JSON.stringify({ok:true,output,revision:result.revision,saved:ack.ok}));
  }else if(action==='export'||result.png){if(!output)throw Error('PNG response requires outputPath to avoid printing base64');await writeFile(output,Buffer.from(result.png,'base64'));console.log(JSON.stringify({ok:true,output,width:result.width,height:result.height,revision:result.revision,...(result.legend?{legend:result.legend}:{})}));}
  else if(result.project){if(!output)throw Error('Project response requires outputPath; use save to write and mark saved');await writeFile(output,JSON.stringify(result.project));console.log(JSON.stringify({ok:true,output,revision:result.revision}));}
  else if(result.recipe&&output){await writeFile(output,JSON.stringify(result.recipe,null,2));console.log(JSON.stringify({ok:true,output,id:result.recipe.id}));}
  else if(result.rules&&output){await writeFile(output,JSON.stringify(result.rules,null,2));console.log(JSON.stringify({ok:true,output,id:result.rules.id}));}
  else console.log(JSON.stringify(result));
}
main().catch(error=>{console.error(JSON.stringify({ok:false,error:error.message,...(error.uncertain!==undefined?{uncertain:error.uncertain}:{})}));process.exitCode=1;});
