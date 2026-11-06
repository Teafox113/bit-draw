import {decodeMatte} from './subject-mask.js';
export const MAX_NATIVE=1024;
export function samplingLayout(source,o){
  const {width,height,fit='contain',padding=0}=o??{};
  if(o?.matte)decodeMatte(o.matte);
  if(![width,height].every(v=>Number.isInteger(v)&&v>=1&&v<=MAX_NATIVE))throw Error('精確寬高需為 1–1024 px');
  if(!['contain','cover','stretch'].includes(fit)||!Number.isInteger(padding)||padding<0||padding*2>=Math.min(width,height))throw Error('縮放方式或留白範圍無效');
  const crop=o.crop??{x:0,y:0,width:source.width,height:source.height};
  if(![crop.x,crop.y,crop.width,crop.height].every(Number.isInteger)||crop.x<0||crop.y<0||crop.width<1||crop.height<1||crop.x+crop.width>source.width||crop.y+crop.height>source.height)throw Error('原圖裁切範圍無效');
  let sx=crop.x,sy=crop.y,sw=crop.width,sh=crop.height,dw=width-padding*2,dh=height-padding*2;
  if(fit==='contain'){const scale=Math.min(dw/sw,dh/sh);dw=Math.max(1,Math.round(sw*scale));dh=Math.max(1,Math.round(sh*scale));}
  if(fit==='cover'){const ratio=dw/dh;if(sw/sh>ratio){const next=sh*ratio;sx+=(sw-next)/2;sw=next;}else{const next=sw/ratio;sy+=(sh-next)/2;sh=next;}}
  return {width,height,source:{x:sx,y:sy,width:sw,height:sh},content:{x:Math.floor((width-dw)/2),y:Math.floor((height-dh)/2),width:dw,height:dh},fit,padding};
}
export function validateProtect(regions,width,height){
  if(!Array.isArray(regions)||regions.length>32||regions.some(r=>!r||![r.x,r.y,r.width,r.height].every(Number.isInteger)||r.x<0||r.y<0||r.width<1||r.height<1||r.x+r.width>width||r.y+r.height>height))throw Error('細節保護需為最多 32 個畫布內矩形');return regions;
}
export function protectionMask(regions,w,h){validateProtect(regions,w,h);const mask=new Uint8Array(w*h);for(const r of regions)for(let y=r.y;y<r.y+r.height;y++)mask.fill(1,y*w+r.x,y*w+r.x+r.width);return mask;}
// Area-weighted source samples: exact output pixels, independent of export zoom.
export function sampleExact(source,grid,{protect=[],onlyProtected=false,detailMode='strong'}={}){
  if(!['balanced','strong'].includes(detailMode))throw Error('細節模式需 balanced/strong');
  const layout=samplingLayout(source,grid.output),{width:w,height:h,content:d,source:s}=layout,px=new Array(w*h*4).fill(0),src=source.pixels,mask=protectionMask(protect,w,h);
  const matte=grid.output.matte,foreground=matte?decodeMatte(matte):null,inside=(x,y)=>!foreground||foreground[Math.min(matte.height-1,Math.floor(y/source.height*matte.height))*matte.width+Math.min(matte.width-1,Math.floor(x/source.width*matte.width))];
  for(let y=d.y;y<d.y+d.height;y++)for(let x=d.x;x<d.x+d.width;x++){
    if(onlyProtected&&!mask[y*w+x])continue;
    const x0=s.x+(x-d.x)*s.width/d.width,x1=s.x+(x+1-d.x)*s.width/d.width,y0=s.y+(y-d.y)*s.height/d.height,y1=s.y+(y+1-d.y)*s.height/d.height,pos=y*w+x,groups=new Map();let weight=0,sum=[0,0,0],center;
    if(grid.method==='center'&&!mask[pos]){const xx=Math.min(source.width-1,Math.floor((x0+x1)/2)),yy=Math.min(source.height-1,Math.floor((y0+y1)/2)),i=(yy*source.width+xx)*4;if(src[i+3]>=grid.alphaThreshold&&inside(xx,yy))center=src.slice(i,i+3);}
    else for(let yy=Math.max(0,Math.floor(y0));yy<Math.min(source.height,Math.ceil(y1));yy++)for(let xx=Math.max(0,Math.floor(x0));xx<Math.min(source.width,Math.ceil(x1));xx++){
      const i=(yy*source.width+xx)*4;if(src[i+3]<grid.alphaThreshold||!inside(xx,yy))continue;const a=(Math.min(x1,xx+1)-Math.max(x0,xx))*(Math.min(y1,yy+1)-Math.max(y0,yy));if(a<=0)continue;weight+=a;
      for(let k=0;k<3;k++)sum[k]+=src[i+k]*a;
      if(grid.method==='dominant'||mask[pos]){const key=(src[i]>>3)*1024+(src[i+1]>>3)*32+(src[i+2]>>3),g=groups.get(key)??[0,0,0,0];g[0]+=a;for(let k=0;k<3;k++)g[k+1]+=src[i+k]*a;groups.set(key,g);}
    }
    let color=center;
    if(weight>0&&weight>=(x1-x0)*(y1-y0)*.5){color=sum.map(v=>v/weight);if(grid.method==='dominant'){let best=[0];for(const g of groups.values())if(g[0]>best[0])best=g;color=best.slice(1).map(v=>v/best[0]);}
      if(mask[pos]){const luminance=c=>c[0]*.2126+c[1]*.7152+c[2]*.0722,mean=sum.map(v=>v/weight),average=luminance(mean);let candidate=null,low=average;for(const g of groups.values())if(g[0]/weight>=.08){const rgb=g.slice(1).map(v=>v/g[0]),lum=luminance(rgb);if(lum<low){low=lum;candidate=rgb;}}if(candidate&&average-low>35){const strength=detailMode==='strong'?1:Math.min(.6,48/(average-low));color=mean.map((v,k)=>v*(1-strength)+candidate[k]*strength);}}
    }
    if(color)for(let k=0;k<4;k++)px[pos*4+k]=k===3?255:Math.round(color[k]);
  }
  return {width:w,height:h,pixels:px};
}
