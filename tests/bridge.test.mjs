import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createBridge} from '../bridge-server.mjs';
test('loopback bridge authenticates, isolates sessions, delivers once and expires requests',async()=>{
 const bridge=createBridge({port:4173,timeout:100}),server=http.createServer(async(req,res)=>{if(!await bridge.handle(req,res)){res.writeHead(404);res.end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
 const call=(route,data,headers={})=>new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port,path:'/api/'+route,method:data?'POST':'GET',headers:{Host:'127.0.0.1:4173','Content-Type':'application/json',Authorization:'Bearer '+bridge.token,...headers}},res=>{let raw='';res.on('data',b=>raw+=b);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(raw)}));});req.on('error',reject);req.end(data?JSON.stringify(data):undefined);});
 try{
  assert.equal((await call('sessions',null,{Authorization:'bad'})).status,401);
  assert.equal((await call('bootstrap',null,{Origin:'https://untrusted.example'})).status,403);
  assert.equal((await call('bootstrap',null,{Host:'untrusted.example'})).status,403);
  assert.equal((await call('bootstrap',null,{'Sec-Fetch-Site':'cross-site'})).status,403);
  const a=(await call('session',{label:'A'})).body.id,b=(await call('session',{label:'B'})).body.id;
  const result=call('request',{sessionId:a,request:{action:'documents.list'}});await new Promise(r=>setTimeout(r,10));
  assert.equal((await call('poll',{sessionId:b})).body.job,null);const job=(await call('poll',{sessionId:a})).body.job;assert.equal(job.request.action,'documents.list');assert.equal((await call('poll',{sessionId:a})).body.job,null);
  await call('result',{sessionId:a,id:job.id,result:{ok:true,documents:[]}});assert.deepEqual((await result).body,{ok:true,documents:[]});
  const timeout=await call('request',{sessionId:a,request:{action:'document.inspect'}});assert.equal(timeout.body.ok,false);assert.equal(timeout.body.uncertain,false);
 }finally{bridge.close();await new Promise(resolve=>server.close(resolve));}
});
