// IndexedDB transactions atomically publish complete snapshots and their shared source.
// Browser-local storage is not a substitute for an exported project file.
export function packBackup(d,owner,now=Date.now()){
  const {source,...rest}=d.engine.project;
  const project=structuredClone(rest);
  for(const frame of project.frames)for(const id of Object.keys(frame.cels))frame.cels[id]=Uint8Array.from(frame.cels[id]);
  return {id:crypto.randomUUID(),documentKey:d.backupKey,owner,name:project.name,width:project.width,height:project.height,revision:d.revision,dirty:d.dirty,time:now,view:structuredClone(d.view),project};
}
export function unpackBackup(snapshot,source){
  if(!snapshot?.project||!source)throw Error('備份不完整，請改選其他版本');
  const project=structuredClone(snapshot.project);project.source={...source,pixels:source.pixels instanceof Uint8Array?source.pixels.slice():Array.from(source.pixels)};
  for(const frame of project.frames)for(const id of Object.keys(frame.cels))frame.cels[id]=Array.from(frame.cels[id]);
  return project;
}
export const backupSummary=({id,documentKey,owner,name,width,height,revision,dirty,time})=>({id,documentKey,owner,name,width,height,revision,dirty,time});
export class LocalLibrary {
  constructor(databaseName='bitdraw-library'){this.ready=new Promise((resolve,reject)=>{
    const request=indexedDB.open(databaseName,1);
    request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('sources');const snapshots=db.createObjectStore('snapshots',{keyPath:'id'});snapshots.createIndex('documentKey','documentKey');db.createObjectStore('recipes',{keyPath:'id'});};
    request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>db.close();resolve(db);};request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('備份資料庫被其他舊分頁阻擋'));
  });this.ready.catch(()=>{});}
  async transact(stores,mode,fn){const db=await this.ready;return new Promise((resolve,reject)=>{
    const tx=db.transaction(stores,mode);let value;tx.oncomplete=()=>resolve(value);tx.onabort=tx.onerror=()=>reject(tx.error??Error('本機儲存失敗'));try{fn(tx,v=>value=v);}catch(error){tx.abort();reject(error);}
  });}
  listBackups(){return this.transact(['snapshots'],'readonly',(tx,done)=>{
    const result=[],r=tx.objectStore('snapshots').openCursor();r.onsuccess=()=>{const c=r.result;if(c){result.push(backupSummary(c.value));c.continue();}else done(result.sort((a,b)=>b.time-a.time));};
  });}
  putBackup(snapshot,source){return this.transact(['sources','snapshots'],'readwrite',tx=>{
    const sources=tx.objectStore('sources'),snapshots=tx.objectStore('snapshots');
    const request=sources.getKey(snapshot.documentKey);request.onsuccess=()=>{if(request.result===undefined)sources.put({...source,pixels:Uint8Array.from(source.pixels)},snapshot.documentKey);};
    snapshots.put(snapshot);const query=snapshots.index('documentKey').getAll(snapshot.documentKey);query.onsuccess=()=>query.result.sort((a,b)=>b.time-a.time).slice(3).forEach(s=>snapshots.delete(s.id));
  });}
  async getBackup(id){const result=await this.transact(['sources','snapshots'],'readonly',(tx,done)=>{
    const req=tx.objectStore('snapshots').get(id);req.onsuccess=()=>{const snapshot=req.result;if(!snapshot){done(null);return;}const src=tx.objectStore('sources').get(snapshot.documentKey);src.onsuccess=()=>done({snapshot,source:src.result});};
  });return result?{snapshot:result.snapshot,project:unpackBackup(result.snapshot,result.source)}:null;}
  deleteBackup(id){return this.transact(['sources','snapshots'],'readwrite',tx=>{
    const store=tx.objectStore('snapshots'),r=store.get(id);r.onsuccess=()=>{if(!r.result)return;const key=r.result.documentKey;store.delete(id);const count=store.index('documentKey').count(key);count.onsuccess=()=>{if(!count.result)tx.objectStore('sources').delete(key);};};
  });}
  listRecipes(){return this.transact(['recipes'],'readonly',(tx,done)=>{const r=tx.objectStore('recipes').getAll();r.onsuccess=()=>done(r.result.map(({id,name,description,parameters,commands,updated})=>({id,name,description,parameters,steps:commands.length,updated})));});}
  getRecipe(id){return this.transact(['recipes'],'readonly',(tx,done)=>{const r=tx.objectStore('recipes').get(id);r.onsuccess=()=>done(r.result);});}
  async putRecipe(recipe,expectedUpdated,updating=false){const result=await this.transact(['recipes'],'readwrite',(tx,done)=>{
    const store=tx.objectStore('recipes'),r=store.get(recipe.id);r.onsuccess=()=>{if(updating?(!r.result||r.result.updated!==expectedUpdated):!!r.result){done(false);return;}store.put(recipe);done(true);};
  });if(!result)throw Error('流程版本衝突，請重新載入');}
  deleteRecipe(id){return this.transact(['recipes'],'readwrite',tx=>tx.objectStore('recipes').delete(id));}
}
export class BackupCoordinator {
  constructor(library,owner){this.library=library;this.owner=owner;this.seen=new Map();this.queue=Promise.resolve();this.clock=0;}
  flush(documents,{force=false}={}){
    // Freeze before awaiting IDB: UI edits cannot change an in-flight backup's revision.
    const pending=[];
    for(const d of documents){if(!d.dirty&&!force)continue;d.backupKey??=crypto.randomUUID();const signature=JSON.stringify([d.revision,d.dirty,d.view]);if(!force&&this.seen.get(d.backupKey)===signature)continue;this.clock=Math.max(Date.now(),this.clock+1);pending.push({snapshot:packBackup(d,this.owner,this.clock),source:d.engine.project.source,signature});}
    const run=async()=>{for(const item of pending){await this.library.putBackup(item.snapshot,item.source);this.seen.set(item.snapshot.documentKey,item.signature);}return {ok:true,saved:pending.length,time:Date.now()};};
    const result=this.queue.then(run);this.queue=result.catch(()=>{});return result;
  }
}
