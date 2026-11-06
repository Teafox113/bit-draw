// Pure, deterministic color and connected-region operations shared with the CLI.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export function hsvToRgb(h, s, v) {
  const c = v / 100 * s / 100, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v / 100 - c;
  const rgb = h < 60 ? [c,x,0] : h < 120 ? [x,c,0] : h < 180 ? [0,c,x] : h < 240 ? [0,x,c] : h < 300 ? [x,0,c] : [c,0,x];
  return rgb.map(n => Math.round(clamp((n + m) * 255, 0, 255)));
}
export function rgbToHsv([r,g,b]) {
  r/=255; g/=255; b/=255; const max=Math.max(r,g,b), min=Math.min(r,g,b), d=max-min;
  let h = !d ? 0 : max===r ? ((g-b)/d)%6 : max===g ? (b-r)/d+2 : (r-g)/d+4;
  return [(h*60+360)%360, max ? d/max*100 : 0, max*100];
}
export function mixRgb(a, b, percent = 50) {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw Error('混色比例需為 0–100');
  // Deliberately interpolate sRGB channels, like numeric RGB editing, not physical pigment.
  return a.slice(0,3).map((v,i)=>Math.round(v*(1-percent/100)+b[i]*percent/100));
}
export function regionOptions(options={}) {
  const tolerance=options.tolerance??20, connectivity=options.connectivity??4;
  if (!Number.isInteger(tolerance)||tolerance<0||tolerance>255) throw Error('色差容許值需為 0–255 的整數');
  if (![4,8].includes(connectivity)) throw Error('相鄰方式需為 4 或 8');
  return {tolerance,connectivity};
}
export const neighbors = (connectivity) => connectivity===8 ? [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]] : [[1,0],[-1,0],[0,1],[0,-1]];
export function segmentRegions(pixels, width, height, options={}) {
  const {tolerance,connectivity}=regionOptions(options), dirs=neighbors(connectivity);
  const labels=new Int32Array(width*height).fill(-1), regions=[], queue=new Int32Array(width*height);
  // Compare to the seed, so a chain of tiny color differences cannot bridge a gradient.
  for(let seed=0;seed<labels.length;seed++) {
    if(labels[seed]!==-1 || !pixels[seed*4+3])continue;
    const id=regions.length, rgb=pixels.slice(seed*4,seed*4+3); let head=0,tail=1,area=0;
    queue[0]=seed;labels[seed]=id;const bounds={x:width,y:height,right:0,bottom:0};
    while(head<tail) {
      const pos=queue[head++],x=pos%width,y=Math.floor(pos/width);area++;
      bounds.x=Math.min(bounds.x,x);bounds.y=Math.min(bounds.y,y);bounds.right=Math.max(bounds.right,x);bounds.bottom=Math.max(bounds.bottom,y);
      for(const [dx,dy] of dirs){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=width||ny>=height)continue;const n=ny*width+nx,i=n*4;
        if(labels[n]!==-1||!pixels[i+3]||rgb.some((v,k)=>Math.abs(v-pixels[i+k])>tolerance))continue;
        labels[n]=id;queue[tail++]=n;
      }
    }
    regions.push({id,area,color:rgb,x:bounds.x,y:bounds.y,width:bounds.right-bounds.x+1,height:bounds.bottom-bounds.y+1,seed:{x:seed%width,y:Math.floor(seed/width)}});
  }
  return {labels,regions};
}
export function outlinePixels(pixels,width,height,options={}) {
  const {connectivity}=regionOptions(options), mode=options.mode??'outer', thickness=options.thickness??1;
  if(!['outer','inner','regions'].includes(mode))throw Error('描邊模式無效');
  if(!Number.isInteger(thickness)||thickness<1||thickness>4)throw Error('描邊寬度需為 1–4 px');
  const color=options.rgb;if(!Array.isArray(color)||color.length<3||!color.slice(0,3).every(v=>Number.isInteger(v)&&v>=0&&v<=255))throw Error('描邊顏色無效');
  const dirs=neighbors(connectivity), occupied=Array.from({length:width*height},(_,i)=>pixels[i*4+3]>0);
  const labels=mode==='regions'?segmentRegions(pixels,width,height,options).labels:null;
  const distance=new Int16Array(width*height).fill(-1),queue=new Int32Array(width*height);let head=0,tail=0;
  for(let i=0;i<occupied.length;i++){
    if(mode==='outer' ? occupied[i] : !occupied[i])continue;
    const x=i%width,y=Math.floor(i/width);
    const edge=dirs.some(([dx,dy])=>{const nx=x+dx,ny=y+dy,out=nx<0||ny<0||nx>=width||ny>=height,n=ny*width+nx;
      return mode==='outer' ? !out&&occupied[n] : out||!occupied[n]||(labels&&labels[n]!==labels[i]);});
    if(edge){distance[i]=1;queue[tail++]=i;}
  }
  while(head<tail){const i=queue[head++];if(distance[i]>=thickness)continue;const x=i%width,y=Math.floor(i/width);
    for(const [dx,dy]of dirs){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=width||ny>=height)continue;const n=ny*width+nx;
      if(distance[n]!==-1||(mode==='outer'?occupied[n]:!occupied[n])||(labels&&labels[n]!==labels[i]))continue;
      distance[n]=distance[i]+1;queue[tail++]=n;
    }
  }
  const out=new Array(pixels.length).fill(0),r=options.region??{x:0,y:0,width,height};
  for(let i=0;i<distance.length;i++){const x=i%width,y=Math.floor(i/width);if(distance[i]>0&&x>=r.x&&y>=r.y&&x<r.x+r.width&&y<r.y+r.height)out.splice(i*4,4,...color.slice(0,3),255);}
  return out;
}
// Original curated sets; all are editable copies when added to a project.
export const PRESET_PALETTES = [
  ['經典冒險 16','171c2d 303950 52546b 797b8a c4c6bb f2e8cd 66413e 9d5b49 d58a55 f1c777 304f45 4f7b53 88aa62 2e6078 5193a1 8fc5c1'],
  ['掌機綠 4','163b30 3b6350 8ba66a dbe6a3'],
  ['霓虹夜城 16','101329 252044 45315f 784578 b6679b ed87b2 234b71 3283a0 56d0cf acf4de 6755a8 9b7deb ceadea e86f60 f3ab62 f6df9d'],
  ['柔和日常 16','393c50 68647c 9b8f9c c8b5b9 e9d9d3 f9f0df 75665c a08a76 cdb394 e8cdaa 56746b 8aa58b bbd2ab 64849e a0b7cd d2deeb'],
  ['肌膚與人像 16','2e2227 4e3033 75423e 975343 b97253 d79970 eeb88e f8d8af 423240 705064 a47889 cea0a8 5e3c2e 916643 c49b6c f0cda0'],
  ['森林苔蘚 16','162c2b 244440 396250 5e8057 8ca76b bed098 e7e8ba 3e3433 635044 8f7155 b79a6c d5bd8a 324f64 507b87 8daaa3 c8d6c3'],
  ['海洋與天空 16','111f3c 1b3558 265575 317e95 49a6b4 7cc8c8 b2e3d9 e8f5e4 433b69 6c6190 a89db7 d4ccdc 826c5e b39b7d d9c5a0 f3e8c8'],
  ['火焰與熔岩 12','1c1724 382031 602d3a 963c39 c64e32 e97439 f69e49 fbc967 f9e69a fff3d0 58434c 8d7376'],
  ['金屬與石材 16','171d29 303a49 4f5c6b 778593 a6b3bb d3dce0 f1f3eb 3d3033 67544a 9b8161 c6ad76 ebd69a 3f5152 6f8880 9fb5a0 d1ddbd'],
  ['糖果街機 16','28203e 59305b 973c70 db5a88 f793af ffc9ce 7b432e bf753c edaf58 ffe493 294a63 397d87 6fc3b3 b5eed1 8e76b7 c4ade5'],
  ['秋日大地 12','2d292c 514037 785743 a87b4f d0a064 ebd49c 6b3f3c a45645 d78351 edb875 4d5942 879362'],
  ['灰階 16','101010 202020 303030 404040 505050 606060 707070 808080 909090 a0a0a0 b0b0b0 c0c0c0 d0d0d0 e0e0e0 f0f0f0 ffffff']
].map(([name,colors])=>({name,colors:colors.split(' ').map(c=>'#'+c)}));
