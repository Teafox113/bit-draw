// Compact, source-coordinate binary masks. Persisted with sampling settings, never with agent summaries.
export function encodeMatte(mask,width,height,method='u2netp'){
 const runs=[];for(let i=0;i<mask.length;){if(!mask[i]){i++;continue;}const start=i;while(i<mask.length&&mask[i])i++;runs.push(start,i-start);}
 return {width,height,method,encoding:'runs-v1',runs};
}
export function decodeMatte(m){
 if(!m||m.encoding!=='runs-v1'||![m.width,m.height].every(v=>Number.isInteger(v)&&v>0&&v<=512)||!Array.isArray(m.runs)||m.runs.length%2||m.runs.length>m.width*m.height*2)throw Error('主體遮罩格式無效');
 const mask=new Uint8Array(m.width*m.height);let end=0;
 for(let k=0;k<m.runs.length;k+=2){const a=m.runs[k],n=m.runs[k+1];if(!Number.isInteger(a)||!Number.isInteger(n)||a<end||n<1||a+n>mask.length)throw Error('主體遮罩範圍無效');mask.fill(1,a,a+n);end=a+n;}
 return mask;
}
export function matteSummary(m){return m?{width:m.width,height:m.height,method:m.method,coverage:Math.round(decodeMatte(m).reduce((a,b)=>a+b,0)/(m.width*m.height)*1000)/1000}:undefined;}
export function compactGrid(grid){if(!grid?.output?.matte)return grid;return {...grid,output:{...grid.output,matte:matteSummary(grid.output.matte)}};}
