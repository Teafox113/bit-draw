import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {loadFaceModel,detectFocus,focusSummary,projectFocus} from '../dist/auto-focus.js';
await mkdir(new URL('./real-v9/',import.meta.url),{recursive:true});
loadFaceModel(await readFile(new URL('../dist/vendor/facefinder',import.meta.url)));
for(const [name,kind]of [['anime','illustration'],['photo','photo']]){const p=JSON.parse(await readFile(new URL(`./real-v8/${name}-icon.bitdraw.json`,import.meta.url),'utf8')),t=performance.now(),result=detectFocus(p.source,{kind}),mapped=projectFocus(p,result),out={...focusSummary(result),protect:mapped.protect,ms:Math.round(performance.now()-t)};await writeFile(new URL(`./real-v9/${name}-focus.json`,import.meta.url),JSON.stringify(out,null,2));console.log(JSON.stringify({name,...out}));}
