import {readFile,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const sessionId=process.argv[2],runtime=JSON.parse(await readFile(new URL('../.bitdraw-runtime.json',import.meta.url),'utf8')),dir=new URL('./real-v10/',import.meta.url);
async function call(request){const r=await fetch(runtime.url+'/api/request',{method:'POST',headers:{Authorization:'Bearer '+runtime.token,'Content-Type':'application/json'},body:JSON.stringify({sessionId,request})}),result=await r.json();assert.notEqual(result.ok,false,result.error);return result;}
console.log(JSON.stringify(await call({action:'documents.list'})));
const opened=await call({action:'document.import',name:'NASA photo · v0.10 QA',mime:'image/jpeg',data:(await readFile(new URL('./real-v8/nasa-portrait.jpg',import.meta.url))).toString('base64')}),documentId=opened.id;
console.log(JSON.stringify({imported:documentId,revision:opened.revision}));
const focus=await call({action:'document.focusPreview',documentId,expectedRevision:0,subjectMode:'quality',kind:'photo'});await writeFile(new URL('live-detection.png',dir),Buffer.from(focus.png,'base64'));console.log(JSON.stringify({faces:focus.faces.length,subject:focus.subject,workerMs:focus.workerMs}));
const recipes=await call({action:'recipe.list'});const savedRecipe=await call({action:'recipe.save',recipe:JSON.parse(await readFile(new URL('../recipes/smart-cutout.json',import.meta.url),'utf8'))});console.log(JSON.stringify({recipeSave:savedRecipe}));
const recipe=savedRecipe.recipe??savedRecipe,recipeId=recipe.id,expectedUpdated=recipe.updated;
const request={action:'recipe.run',documentId,expectedRevision:0,recipeId,expectedUpdated,values:{kind:'photo'}};
const preview=await call({...request,dryRun:true});assert.equal((await call({action:'document.inspect',documentId})).revision,0);
const after=await call(request),image=await call({action:'document.export',documentId});await writeFile(new URL('live-photo.png',dir),Buffer.from(image.png,'base64'));
const saved=await call({action:'document.save',documentId});assert.equal(saved.project.project.version,5);await writeFile(new URL('live-photo.bitdraw.json',dir),JSON.stringify(saved.project));await call({action:'document.markSaved',documentId,expectedRevision:after.revision});
const reopened=await call({action:'document.open',project:saved.project}),inspect=await call({action:'document.inspect',documentId:reopened.id});assert.equal(inspect.grid.output.matte.runs,undefined);assert.equal(inspect.width,96);assert.equal(inspect.height,74);
await writeFile(new URL('live-report.json',dir),JSON.stringify({sessionId,documentId,reopenedId:reopened.id,recipeId,expectedUpdated,focusMs:focus.workerMs,preview,after},null,2));console.log(JSON.stringify({ok:true,documentId,reopenedId:reopened.id,revision:after.revision,recipeId,expectedUpdated,workerMs:after.workerMs}));
