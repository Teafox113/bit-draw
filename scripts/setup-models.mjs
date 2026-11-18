import {mkdir,copyFile,rename,unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';import {Readable} from 'node:stream';import {pipeline} from 'node:stream/promises';import {createWriteStream,createReadStream} from 'node:fs';
import {models} from './model-manifest.mjs';
const root=new URL('../',import.meta.url),vendor=new URL('dist/vendor/',root);await mkdir(new URL('ort/',vendor),{recursive:true});
for(const name of ['ort.wasm.min.mjs','ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm'])await copyFile(new URL('node_modules/onnxruntime-web/dist/'+name,root),new URL('ort/'+name,vendor));
const digest=async url=>{const hash=createHash('sha256');for await(const chunk of createReadStream(url))hash.update(chunk);return hash.digest('hex');};
for(const {name,sha256,url}of models.filter(m=>process.argv.includes('--anime')?m.mode==='anime':m.mode!=='anime')){const dest=new URL(name,vendor);if(await digest(dest).catch(()=>null)===sha256){console.log(name+' verified');continue;}const temp=new URL(name+'.download',vendor);try{console.log('Downloading '+name);const r=await fetch(url);if(!r.ok)throw Error('Download failed: '+r.status);await pipeline(Readable.fromWeb(r.body),createWriteStream(temp));if(await digest(temp)!==sha256)throw Error('Model SHA-256 mismatch');await rename(temp,dest);}catch(e){await unlink(temp).catch(()=>{});throw e;}}
console.log('Local models ready. Runtime does not upload images.');
