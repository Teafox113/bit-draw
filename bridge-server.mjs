import {randomBytes,randomUUID} from 'node:crypto';
export function createBridge({port,timeout=45000}={}) {
  const token=randomBytes(32).toString('hex'),sessions=new Map(),jobs=new Map();
  const json=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));};
  async function body(req){let size=0,parts=[];for await(const part of req){size+=part.length;if(size>160*1024*1024)throw Error('Request too large');parts.push(part);}return parts.length?JSON.parse(Buffer.concat(parts).toString()):{};}
  function prune(){const now=Date.now();for(const [id,s]of sessions)if(now-s.lastSeen>30000)sessions.delete(id);}
  async function handle(req,res){
    const url=new URL(req.url,'http://127.0.0.1');if(!url.pathname.startsWith('/api/'))return false;
    const allowedHosts=[`127.0.0.1:${port}`,`localhost:${port}`];
    const origin=req.headers.origin,site=req.headers['sec-fetch-site'];
    if(!allowedHosts.includes(req.headers.host)||(origin&&!allowedHosts.some(h=>origin===`http://${h}`))||(site&&!['same-origin','none'].includes(site))){json(res,403,{ok:false,error:'Local same-origin access only'});return true;}
    try{
      prune();
      if(url.pathname==='/api/bootstrap'&&req.method==='GET'){json(res,200,{token,protocol:1});return true;}
      if(req.headers.authorization!==`Bearer ${token}`){json(res,401,{ok:false,error:'Invalid local token'});return true;}
      if(url.pathname==='/api/sessions'&&req.method==='GET'){json(res,200,{sessions:[...sessions.values()].map(s=>({id:s.id,label:s.label,lastSeen:s.lastSeen}))});return true;}
      if(url.pathname==='/api/session'&&req.method==='POST'){
        const b=await body(req),id=randomUUID();sessions.set(id,{id,label:String(b.label||'BIT DRAW').slice(0,120),lastSeen:Date.now()});json(res,200,{id});return true;
      }
      if(url.pathname==='/api/poll'&&req.method==='POST'){
        const b=await body(req),s=sessions.get(b.sessionId);if(!s){json(res,404,{error:'Session expired'});return true;}s.lastSeen=Date.now();
        const job=[...jobs.values()].find(j=>j.sessionId===s.id&&!j.delivered);if(job)job.delivered=true;
        json(res,200,{job:job?{id:job.id,request:job.request}:null});return true;
      }
      if(url.pathname==='/api/result'&&req.method==='POST'){
        const b=await body(req),j=jobs.get(b.id);if(j&&j.sessionId===b.sessionId){clearTimeout(j.timer);jobs.delete(j.id);j.resolve(b.result);}
        json(res,200,{ok:true});return true;
      }
      if(url.pathname==='/api/request'&&req.method==='POST'){
        const b=await body(req);if(!sessions.has(b.sessionId))throw Error('Session missing or expired; open the workbench and list sessions again');
        if(!b.request||typeof b.request.action!=='string')throw Error('Missing action');
        if([...jobs.values()].some(j=>j.sessionId===b.sessionId))throw Error('This session already has a pending command');
        const id=randomUUID();const result=await new Promise(resolve=>{const timer=setTimeout(()=>{const j=jobs.get(id);jobs.delete(id);resolve({ok:false,error:'工作台回覆逾時；結果可能已套用，請重新 inspect 核對版本，不要自動重送',uncertain:!!j?.delivered});},timeout);jobs.set(id,{id,sessionId:b.sessionId,request:b.request,resolve,timer,delivered:false});});json(res,200,result);return true;
      }
      json(res,404,{error:'Unknown API route'});
    }catch(error){json(res,400,{ok:false,error:error.message});}
    return true;
  }
  return {token,handle,close(){for(const j of jobs.values()){clearTimeout(j.timer);j.resolve({ok:false,error:'Server stopped'});}jobs.clear();}};
}
