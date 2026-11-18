// One-time conversion from locally licensed v0.9 fixtures. Committed .rgba.gz fixtures make v0.11 QA reproducible.
import {readFile,writeFile,mkdir} from 'node:fs/promises';import {gzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {unpackProject} from '../dist/project-codec.js';import {analysisRaster} from '../dist/auto-focus.js';
const dir=new URL('./fixtures-v11/',import.meta.url);await mkdir(dir,{recursive:true});
const metadata=[];for(const [name,path,max,author,license,url]of [
 ['anime','real-v9/anime.bitdraw.json',null,'Kasuga','CC-BY-SA-3.0','https://commons.wikimedia.org/wiki/File:Wikipe-tan_full_length.png'],
 ['photo','real-v9/photo.bitdraw.json',1024,'NASA','Public domain','https://commons.wikimedia.org/wiki/File:Eileen_Collins,_early_NASA_portrait.jpg'],
 ['coffee','real-v8/coffee-fixed.bitdraw.json',null,'Rachel Michetti','CC0-1.0','https://scikit-image.org/docs/stable/api/skimage.data.html#skimage.data.coffee']
 ]){const p=await unpackProject(JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'))),s=max?analysisRaster(p.source,max):p.source,bytes=Uint8Array.from(s.pixels),file=name+'.rgba.gz';await writeFile(new URL(file,dir),gzipSync(bytes));metadata.push({name,file,width:s.width,height:s.height,sha256:createHash('sha256').update(bytes).digest('hex'),author,license,url,changes:max?'縮至長邊 1024 px，作為測試背景及照片回歸素材':'由原始圖片解碼為 RGBA'});}
await writeFile(new URL('sources.json',dir),JSON.stringify(metadata,null,2));console.log(metadata.map(({name,width,height})=>({name,width,height})));
