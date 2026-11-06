const hex=s=>s.slice(1).match(/../g).map(v=>parseInt(v,16));
export function styledOutline(p,px,options,mask,protectedMask){
 const {mode='outer',style='solid',geometry='diamond',thickness=1,color='#252333',lightColor='#ffffff',light='top-left'}=options;
 const directions={'top-left':[-1,-1],top:[0,-1],'top-right':[1,-1],left:[-1,0],right:[1,0],'bottom-left':[-1,1],bottom:[0,1],'bottom-right':[1,1]};
 if(!['inner','outer'].includes(mode)||!['solid','adaptive','selective','double'].includes(style)||!['diamond','square'].includes(geometry)||!Number.isInteger(thickness)||thickness<1||thickness>4||![color,lightColor].every(s=>typeof s==='string'&&/^#[\da-f]{6}$/i.test(s))||!directions[light]||style==='double'&&(mode!=='outer'||thickness<2))throw Error('描邊參數無效；雙線需外描邊、寬度 2–4');
 const w=p.width,h=p.height,n=w*h,before=px.slice(),distance=new Int8Array(n).fill(-1),owner=new Int32Array(n).fill(-1),queue=[],steps=geometry==='square'?[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]:[[-1,0],[1,0],[0,-1],[0,1]],around=i=>steps.map(([dx,dy])=>{const x=i%w+dx,y=Math.floor(i/w)+dy;return x<0||y<0||x>=w||y>=h?-1:y*w+x;});
 for(let i=0;i<n;i++){if(mode==='outer'?(mask[i]||before[i*4+3]):!mask[i])continue;const adjacent=around(i).find(j=>mode==='outer'?j>=0&&mask[j]:j<0||!mask[j]);if(adjacent!==undefined){distance[i]=1;owner[i]=mode==='outer'?adjacent:i;queue.push(i);}}
 for(let k=0;k<queue.length;k++){const i=queue[k];if(distance[i]>=thickness)continue;for(const j of around(i))if(j>=0&&distance[j]<0&&(mode==='outer'?!mask[j]&&!before[j*4+3]:mask[j])){distance[j]=distance[i]+1;owner[j]=owner[i];queue.push(j);}}
 let count=0;for(const i of queue){if(protectedMask[i])continue;const at=owner[i],x=at%w,y=Math.floor(at/w);let nx=0,ny=0;for(const [dx,dy]of steps){const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=w||yy>=h||!mask[yy*w+xx]){nx+=dx;ny+=dy;}}const [lx,ly]=directions[light];if(style==='selective'&&nx*lx+ny*ly>0)continue;
 let rgb=hex(color);if(style==='adaptive'||style==='selective'){rgb=before.slice(at*4,at*4+3).map(v=>Math.round(v*.5));}if(style==='double'&&distance[i]>1)rgb=hex(lightColor);px.splice(i*4,4,...rgb,255);count++;}return count;
}
