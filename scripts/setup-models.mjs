import {readFile,writeFile,mkdir,copyFile,rename,unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';import {Readable} from 'node:stream';import {pipeline} from 'node:stream/promises';import {createWriteStream} from 'node:fs';
const root=new URL('../',import.meta.url),vendor=new URL('dist/vendor/',root);await mkdir(new URL('ort/',vendor),{recursive:true});
for(const name of ['ort.wasm.min.mjs','ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm'])await copyFile(new URL('node_modules/onnxruntime-web/dist/'+name,root),new URL('ort/'+name,vendor));
const models=[['u2netp.onnx','8e83ca70e441ab06c318d82300c84806'],['u2net.onnx','60024c5c889badc19c04ad937298a77b']];
const digest=async url=>createHash('md5').update(await readFile(url)).digest('hex');
for(const [name,md5]of models){const dest=new URL(name,vendor);if(await digest(dest).catch(()=>null)===md5){console.log(name+' verified');continue;}const temp=new URL(name+'.download',vendor);try{console.log('Downloading '+name);const r=await fetch('https://github.com/danielgatis/rembg/releases/download/v0.0.0/'+name);if(!r.ok)throw Error('Download failed: '+r.status);await pipeline(Readable.fromWeb(r.body),createWriteStream(temp));if(await digest(temp)!==md5)throw Error('Model checksum mismatch');await rename(temp,dest);}catch(e){await unlink(temp).catch(()=>{});throw e;}}
console.log('Local models ready. Runtime does not upload images.');
