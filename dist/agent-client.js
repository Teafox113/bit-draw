export function connectAgent(handle,status) {
  let stopped=false,sessionId=null,token=null,timer=null;
  async function call(route,data){const res=await fetch('/api/'+route,{method:data?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(data?{body:JSON.stringify(data)}:{})});if(!res.ok)throw Error('Connection unavailable');return res.json();}
  async function tick(){
    if(stopped)return;
    try{
      if(!sessionId){token=(await call('bootstrap')).token;sessionId=(await call('session',{label:'BIT DRAW · '+new Date().toLocaleTimeString()})).id;status('已連線 · '+sessionId.slice(0,8),sessionId);}
      const {job}=await call('poll',{sessionId});
      if(job){let result;try{result=await handle(job.request);}catch(e){result={ok:false,error:e.message};}await call('result',{id:job.id,sessionId,result});}
    }catch{sessionId=null;status('未連線 · 請啟動本機伺服器',null);}
    if(!stopped)timer=setTimeout(tick,sessionId?500:3000);
  }
  tick();return {stop(){stopped=true;clearTimeout(timer);}};
}
