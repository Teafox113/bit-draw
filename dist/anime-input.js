// Anime Segmentation input convention: aspect-preserving RGB/255, centered on black padding.
export function animeLayout(width,height,size=1024){
 if(![width,height,size].every(v=>Number.isInteger(v)&&v>0))throw Error('動漫模型輸入尺寸無效');
 const scale=size/Math.max(width,height),w=Math.max(1,Math.floor(width*scale)),h=Math.max(1,Math.floor(height*scale));
 return {size,width:w,height:h,x:Math.floor((size-w)/2),y:Math.floor((size-h)/2)};
}
export function animeInput(source,size=1024){
 const layout=animeLayout(source.width,source.height,size),data=new Float32Array(3*size*size),p=source.pixels,n=size*size;
 for(let y=0;y<layout.height;y++)for(let x=0;x<layout.width;x++){
  const sx=Math.max(0,Math.min(source.width-1,(x+.5)*source.width/layout.width-.5)),sy=Math.max(0,Math.min(source.height-1,(y+.5)*source.height/layout.height-.5)),x0=Math.floor(sx),y0=Math.floor(sy),fx=sx-x0,fy=sy-y0,pos=(y+layout.y)*size+x+layout.x;
  for(let c=0;c<3;c++){let value=0;for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){const i=(Math.min(source.height-1,y0+dy)*source.width+Math.min(source.width-1,x0+dx))*4;value+=p[i+c]*(p[i+3]/255)*(dx?fx:1-fx)*(dy?fy:1-fy);}data[c*n+pos]=value/255;}
 }
 return {data,layout};
}
// Store an aspect-correct mask at <=512 on its long edge; exclude padding before resampling.
export function animeOutput(raw,layout,source,max=512){
 if(raw.length!==layout.size*layout.size)throw Error('動漫模型輸出尺寸不符');
 const scale=Math.min(1,max/Math.max(source.width,source.height)),width=Math.max(1,Math.round(source.width*scale)),height=Math.max(1,Math.round(source.height*scale)),probability=new Float32Array(width*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const sx=layout.x+Math.max(0,Math.min(layout.width-1,(x+.5)*layout.width/width-.5)),sy=layout.y+Math.max(0,Math.min(layout.height-1,(y+.5)*layout.height/height-.5)),x0=Math.floor(sx),y0=Math.floor(sy),fx=sx-x0,fy=sy-y0;let v=0;
  for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)v+=raw[Math.min(layout.size-1,y0+dy)*layout.size+Math.min(layout.size-1,x0+dx)]*(dx?fx:1-fx)*(dy?fy:1-fy);
  probability[y*width+x]=Number.isFinite(v)?Math.max(0,Math.min(1,v)):0;
 }
 return {probability,width,height};
}
