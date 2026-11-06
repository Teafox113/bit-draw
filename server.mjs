import http from 'node:http';
import { readFile,writeFile,unlink } from 'node:fs/promises';
import {createBridge} from './bridge-server.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(fileURLToPath(new URL('./dist/', import.meta.url)));
const port = Number(process.env.BIT_DRAW_PORT || 4173);
const bridge=createBridge({port});
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.wasm':'application/wasm', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const server=http.createServer(async (req, res) => {
  try {
    if(await bridge.handle(req,res))return;
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const target = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!target.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    const body = await readFile(target);
    res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, '127.0.0.1', async () => {await writeFile(new URL('./.bitdraw-runtime.json',import.meta.url),JSON.stringify({url:`http://127.0.0.1:${port}`,token:bridge.token,pid:process.pid}));console.log(`BIT DRAW ready: http://127.0.0.1:${port}`);});
async function stop(){bridge.close();server.close();try{const file=new URL('./.bitdraw-runtime.json',import.meta.url);const value=JSON.parse(await readFile(file,'utf8'));if(value.pid===process.pid)await unlink(file);}catch{}process.exit(0);}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
