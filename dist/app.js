import { Engine, makeProject, activePixels, composite, validateGrid, toHex, parseColor, MAX_SOURCE_PIXELS } from './core.js';
import {samplingLayout} from './sampling.js';
import {TaskClient,commitTask} from './task-client.js';
import {legacyProject} from './project-codec.js';
const tasks=new TaskClient();
import { initStudio } from './studio.js';
import {Workspace, capabilities} from './workspace.js';
import {connectAgent} from './agent-client.js';
import {analyzeSource} from './core.js';
import {initAutomation} from './automation.js';
const documents=new Workspace();
let studio,automation;
const $ = id => document.getElementById(id);
let engine, tool = 'paint', selection = null, stroke = null, sourceBitmap, resultBitmap = document.createElement('canvas');
let toastTimer, dirty = false, fileBusy = false;
let selectedSwatch = -1, spaceDown = false, pan = null;
const activeLayer = () => engine.project.layers.find(l => l.id === engine.project.activeLayerId);
const activeBook = () => engine.project.swatchBooks.find(b => b.id === engine.project.activeBookId);
const gridKeys = ['cellWidth', 'cellHeight', 'offsetX', 'offsetY', 'method', 'alphaThreshold'];
function message(text, error = false) {
  $('status').textContent = text; $('toast').textContent = text;
  $('toast').className = 'visible' + (error ? ' error' : ''); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').className = '', 4200);
}
function attempt(fn) { try { return fn(); } catch (error) { message(error.message, true); } }
function readGrid() { const g=Object.fromEntries(gridKeys.map(k => [k, k === 'method' ? $(k).value : Number($(k).value)]));return {...g,output:engine?.project.grid.output&&gridKeys.every(k=>g[k]===engine.project.grid[k])?engine.project.grid.output:null}; }
function syncGrid() { for (const key of gridKeys) $(key).value = engine.project.grid[key]; $('finishProtect').value=JSON.stringify(engine.project.metadata?.extensions?.detailProtection?.regions??[]);$('finishResult').textContent='畫布狀態已更新，請重新預演。';$('pixelQuickResult').textContent=`目前原生 ${engine.project.width} × ${engine.project.height} px`; }
function setSourceBitmap() {
  const s = engine.project.source;
  sourceBitmap = document.createElement('canvas'); sourceBitmap.width = s.width; sourceBitmap.height = s.height;
  sourceBitmap.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(s.pixels), s.width, s.height), 0, 0);
}
function gridPreview() {
  if (!engine) return;
  $('alphaValue').textContent = $('alphaThreshold').value;
  try {
    const g = readGrid(), size = validateGrid(g, engine.project.source);
    $('gridInfo').textContent = `預計輸出 ${size.width} × ${size.height} px`;
    $('gridInfo').className = 'grid-info'; $('rebuild').disabled = false;
    $('sourceHint').textContent = g.output?`原生 ${size.width} × ${size.height} px · ${g.output.fit}`:`每格 ${g.cellWidth} × ${g.cellHeight} px`;
    renderSource(g);
  } catch (error) {
    $('gridInfo').textContent = error.message; $('gridInfo').className = 'grid-info error'; $('rebuild').disabled = true;
    renderSource(null);
  }
}
function renderSource(grid = readGrid()) {
  if (!sourceBitmap || !$('compare').checked || $('compareMode').value==='overlay') return;
  const canvas = $('sourceCanvas'), view = $('sourceViewport'), s = engine.project.source;
  if(grid?.output){const layout=samplingLayout(s,grid.output),a=layout.source,b=layout.content,scale=displayScale();canvas.width=layout.width;canvas.height=layout.height;canvas.style.width=layout.width*scale+'px';canvas.style.height=layout.height*scale+'px';const ctx=canvas.getContext('2d');ctx.drawImage(sourceBitmap,a.x,a.y,a.width,a.height,b.x,b.y,b.width,b.height);return;}
  canvas.width = s.width; canvas.height = s.height;
  const g=engine.project.grid, linked=$('syncViews').checked;
  const factor = linked ? displayScale()/g.cellWidth : Math.max(.01, Math.min((view.clientWidth - 72) / s.width, (view.clientHeight - 72) / s.height));
  const factorY=linked?displayScale()/g.cellHeight:factor;
  canvas.style.width = Math.max(1, Math.floor(s.width * factor)) + 'px'; canvas.style.height = Math.max(1, Math.floor(s.height * factorY)) + 'px';
  const ctx = canvas.getContext('2d'); ctx.drawImage(sourceBitmap, 0, 0);
  if (grid && $('showGrid').checked) {
    ctx.strokeStyle = '#75d8d58c'; ctx.lineWidth = 0.6 / factor; ctx.beginPath();
    for (let x = grid.offsetX; x <= s.width; x += grid.cellWidth) { ctx.moveTo(x, 0); ctx.lineTo(x, s.height); }
    for (let y = grid.offsetY; y <= s.height; y += grid.cellHeight) { ctx.moveTo(0, y); ctx.lineTo(s.width, y); }
    ctx.stroke();
    ctx.fillStyle = '#000a'; ctx.fillRect(0, 0, grid.offsetX, s.height); ctx.fillRect(grid.offsetX, 0, s.width - grid.offsetX, grid.offsetY);
  }
}
function displayScale(){
  if($('zoom').value!=='fit')return Number($('zoom').value);
  const p=engine.project,v=$('resultViewport');let fit=Math.min((v.clientWidth-72)/p.width,(v.clientHeight-72)/p.height);
  if($('compare').checked&&$('compareMode').value!=='overlay'&&$('syncViews').checked&&!p.grid.output){const s=$('sourceViewport');fit=Math.min(fit,(s.clientWidth-72)/(p.source.width/p.grid.cellWidth),(s.clientHeight-72)/(p.source.height/p.grid.cellHeight));}
  return Math.max(1,Math.min(24,Math.floor(fit)));
}
function renderResult() {
  if (!engine) return;
  const p = engine.project, canvas = $('resultCanvas'), view = $('resultViewport');
  const fit = Math.max(1, Math.min(24, Math.floor(Math.min((view.clientWidth - 72) / p.width, (view.clientHeight - 72) / p.height))));
  const scale = displayScale();
  resultBitmap.width = p.width; resultBitmap.height = p.height;
  const base = composite(p, stroke?.preview);
  resultBitmap.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(studio ? studio.pixels(p, base) : base), p.width, p.height), 0, 0);
  canvas.width = p.width * scale; canvas.height = p.height * scale;
  canvas.style.width = canvas.width + 'px'; canvas.style.height = canvas.height + 'px';
  const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(resultBitmap, 0, 0, canvas.width, canvas.height);
  if($('compareMode').value==='overlay'&&$('compare').checked){const g=p.grid;ctx.save();ctx.globalAlpha=Number($('overlayOpacity').value)/100;ctx.imageSmoothingEnabled=false;if(g.output){const {source:a,content:b}=samplingLayout(p.source,g.output);ctx.drawImage(sourceBitmap,a.x,a.y,a.width,a.height,b.x*scale,b.y*scale,b.width*scale,b.height*scale);}else ctx.drawImage(sourceBitmap,-g.offsetX*scale/g.cellWidth,-g.offsetY*scale/g.cellHeight,p.source.width*scale/g.cellWidth,p.source.height*scale/g.cellHeight);ctx.restore();}
  if ($('showGrid').checked && scale >= 6) {
    ctx.strokeStyle = '#0c160d40'; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 0; x <= canvas.width; x += scale) { ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, canvas.height); }
    for (let y = 0; y <= canvas.height; y += scale) { ctx.moveTo(0, y + .5); ctx.lineTo(canvas.width, y + .5); }
    ctx.stroke();
  }
  if (selection) {
    const { x, y, width, height } = selection;
    ctx.lineWidth = 2; ctx.strokeStyle = '#15200b'; ctx.strokeRect(x * scale + 1, y * scale + 1, width * scale - 2, height * scale - 2);
    ctx.setLineDash([4, 4]); ctx.strokeStyle = '#edff9f'; ctx.strokeRect(x * scale + 1, y * scale + 1, width * scale - 2, height * scale - 2);
  }
  $('resultSize').textContent = `${p.width} × ${p.height} px · ${scale}×`;
}
function renderPalette() {
  const palette = engine.project.palette, selected = $('paintColor').value.toLowerCase();
  $('swatches').replaceChildren();
  for (const c of palette.slice(0, 256)) {
    const button = document.createElement('button'); button.style.background = c.hex;
    button.title = `${c.hex.toUpperCase()} · ${c.count} 像素`; button.setAttribute('aria-label', `選擇顏色 ${c.hex}`);
    button.className = c.hex === selected ? 'picked' : '';
    button.onclick = () => setColor(c.hex); $('swatches').append(button);
  }
  $('paletteCount').textContent = `${palette.length} 色`;
  $('paletteNote').textContent = palette.length > 256 ? `顯示最常用的 256 色，共 ${palette.length} 色。可縮色以整理色盤。` : '點選色卡或使用吸色工具。局部修改可加入新顏色。';
}
function setColor(hex) {
  const rgb = parseColor(hex); $('paintColor').value = hex; $('colorHex').value = hex.toUpperCase();
  ['red','green','blue'].forEach((id, i) => $(id).value = rgb[i]); $('railColor').style.background = hex; renderPalette();
}
function renderBooks() {
  const p = engine.project, book = activeBook();
  $('bookSelect').replaceChildren(...p.swatchBooks.map(b => { const o = document.createElement('option'); o.value = b.id; o.textContent = b.name; return o; }));
  $('bookSelect').value = book.id; $('bookName').value = book.name; $('customCount').textContent = `${book.colors.length} / 256`;
  $('customSwatches').replaceChildren();
  book.colors.forEach((hex, index) => {
    const b = document.createElement('button'); b.style.background = hex; b.title = hex.toUpperCase(); b.setAttribute('aria-label', `自訂色卡 ${index + 1} ${hex}`); b.classList.toggle('picked', index === selectedSwatch);
    b.onclick = () => { selectedSwatch = index; setColor(hex); renderBooks(); }; $('customSwatches').append(b);
  });
  $('swatchUpdate').disabled = $('swatchRemove').disabled = selectedSwatch < 0 || selectedSwatch >= book.colors.length;
  $('bookDelete').disabled = p.swatchBooks.length === 1;
}
function renderLayers() {
  const p = engine.project, current = activeLayer(), currentIndex = p.layers.indexOf(current);
  $('layerCount').textContent = `${p.layers.length} / 16`; $('layerName').value = current.name; $('layerOpacity').value = Math.round(current.opacity * 100);
  $('activeLayerCaption').textContent = `合成預覽 · ${current.name}${current.locked ? ' · 已鎖定' : ''}`;
  $('layerList').replaceChildren();
  for (const l of [...p.layers].reverse()) {
    const row = document.createElement('div'); row.className = 'layer-row' + (l.id === current.id ? ' active' : '') + (!l.visible ? ' hidden-layer' : ''); row.setAttribute('role','listitem');
    const eye = document.createElement('button'); eye.textContent = l.visible ? '◉' : '○'; eye.title = `${l.visible ? '隱藏' : '顯示'} ${l.name}`; eye.setAttribute('aria-label', eye.title); eye.onclick = () => attempt(() => execute({op:'layer.update', id:l.id, patch:{visible:!l.visible}}));
    const select = document.createElement('button'); select.className = 'layer-select'; select.setAttribute('aria-label', `選取圖層 ${l.name}`); select.setAttribute('aria-pressed', String(l.id === current.id));
    const thumb = document.createElement('canvas'); thumb.width = p.width; thumb.height = p.height; thumb.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(p.frames[0].cels[l.id]), p.width, p.height), 0, 0);
    const name = document.createElement('span'); name.textContent = l.name; select.append(thumb, name); select.onclick = () => attempt(() => execute({op:'layer.select', id:l.id}));
    const lock = document.createElement('button'); lock.textContent = l.locked ? '◆' : '◇'; lock.title = `${l.locked ? '解鎖' : '鎖定'} ${l.name}`; lock.setAttribute('aria-label', lock.title); lock.onclick = () => attempt(() => execute({op:'layer.update', id:l.id, patch:{locked:!l.locked}}));
    row.append(eye, select, lock); $('layerList').append(row);
  }
  $('layerUp').disabled = current.locked || currentIndex === p.layers.length - 1;
  $('layerDown').disabled = current.locked || currentIndex === 0;
  $('layerMerge').disabled = current.locked || !current.visible || currentIndex === 0 || p.layers[currentIndex - 1].locked || !p.layers[currentIndex - 1].visible;
  $('layerDelete').disabled = current.locked || p.layers.length === 1;
  $('layerAdd').disabled = $('layerDuplicate').disabled = p.layers.length === 16;
}
function renderAll() {
  const p = engine.project;
  $('projectName').textContent = p.name + (dirty ? ' •' : '');
  $('sourceSize').textContent = `${p.source.width} × ${p.source.height}`;
  $('undo').disabled = !engine.history.length; $('redo').disabled = !engine.future.length;
  $('clearSelection').disabled = !selection;
  $('clearPixels').disabled = !selection;
  $('reduceScope').textContent = selection ? `只處理目前圖層的選區 ${selection.width} × ${selection.height}。` : '只處理目前圖層；其他圖層保持原色。';
  documents.get().dirty=dirty;renderTabs();
  gridPreview(); renderResult(); renderPalette(); renderBooks(); renderLayers();
}
function execute(command) {
  if (stroke) throw Error('請先完成目前筆畫');
  const result=documents.apply(documents.activeId,[command]);dirty = true; studio?.invalidate();
  if (['grid.set', 'rebuild', 'image.pixelize', 'image.pipeline', 'undo', 'redo'].includes(command.op)) { selection = null; syncGrid(); }
  if (command.op.startsWith('swatch.') || command.op.startsWith('palette.')) selectedSwatch = -1;
  renderAll(); return result;
}
function executeBatch(commands) {
  if (stroke) throw Error('請先完成目前筆畫');
  const result=documents.apply(documents.activeId,commands);
  studio?.invalidate(); selection=null;dirty=true;selectedSwatch=-1;syncGrid();renderAll();return result;
}
function replaceProject(project, label) {
  if(engine)captureDocument();
  const d=documents.add(project);activateDocument(d.id);message(label);
}
function captureDocument(){if(!engine)return;const d=documents.get();d.dirty=dirty;d.view={selection,tool,color:$('paintColor').value,zoom:$('zoom').value,compareMode:$('compareMode').value,overlayOpacity:$('overlayOpacity').value,syncViews:$('syncViews').checked,showGrid:$('showGrid').checked,panel:document.querySelector('[data-panel].active')?.dataset.panel??'edit',gridValues:Object.fromEntries(gridKeys.map(k=>[k,$(k).value])),scroll:[$('resultViewport').scrollLeft,$('resultViewport').scrollTop,$('sourceViewport').scrollLeft,$('sourceViewport').scrollTop]};}
function activateDocument(id){
  documents.select(id);const d=documents.get(),v=d.view;engine=d.engine;selection=v.selection??null;stroke=null;selectStart=null;pan=null;dirty=d.dirty;selectedSwatch=-1;
  $('finishProtect').value=JSON.stringify(engine.project.metadata?.extensions?.detailProtection?.regions??[]);
  $('focusAtlas').hidden=true;$('focusResult').textContent='請分析目前文件的五官與主體範圍。';
  $('zoom').value=v.zoom??'fit';$('compareMode').value=v.compareMode??'horizontal';$('overlayOpacity').value=v.overlayOpacity??50;$('showGrid').checked=v.showGrid??false;$('syncViews').checked=v.syncViews??true;
  studio?.invalidate();
  setSourceBitmap();syncGrid();if(v.gridValues)for(const k of gridKeys)$(k).value=v.gridValues[k];
  selectTool(v.tool??'paint');setColor(v.color??'#c7e68c');showPanel(v.panel??'edit');updateCompare();renderAll();
  if(v.scroll){$('resultViewport').scrollLeft=v.scroll[0];$('resultViewport').scrollTop=v.scroll[1];$('sourceViewport').scrollLeft=v.scroll[2];$('sourceViewport').scrollTop=v.scroll[3];}
}
let closingDocumentId=null;
function closeDocument(id){captureDocument();tasks.forget(documents.get(id).engine.project.source);documents.close(id,{discard:true});activateDocument(documents.activeId);}
function renderTabs(){
  $('documentTabs').replaceChildren(...documents.list().map(d=>{const wrap=document.createElement('div');wrap.className='file-tab'+(d.active?' active':'');
    const b=document.createElement('button');b.textContent=d.name+(d.dirty?' •':'');b.title=`${d.name} · ${d.id} · r${d.revision}`;b.setAttribute('role','tab');b.setAttribute('aria-selected',String(d.active));b.onclick=()=>attempt(()=>{if(stroke)throw Error('請先完成筆畫');captureDocument();activateDocument(d.id);});
    const close=document.createElement('button');close.textContent='×';close.setAttribute('aria-label',`關閉 ${d.name}`);close.disabled=documents.documents.length===1;close.onclick=()=>attempt(()=>{if(stroke)throw Error('請先完成筆畫');captureDocument();const item=documents.get(d.id);if(item.dirty){closingDocumentId=d.id;$('closeDocumentText').textContent=`「${d.name}」尚未儲存。請取消並先儲存，或捨棄本分頁的修改。`;$('closeDocumentDialog').showModal();return;}closeDocument(d.id);});wrap.append(b,close);return wrap;}));
}
function okayToReplace() { if(documents.documents.length>=8){message('最多開啟 8 份文件，請先儲存並關閉部分分頁。',true);return false;}return true; }
async function importImage(file) {
  if (!file || fileBusy) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { message('第一階段支援 PNG、JPG、WebP；GIF 動畫將在後續加入。', true); return; }
  if (file.size > 20 * 1024 * 1024) { message('圖片檔案上限為 20 MB。', true); return; }
  if (!okayToReplace()) return;
  fileBusy = true;
  let bitmap;
  try {
    message('正在讀取圖片…'); bitmap = await createImageBitmap(file);
    if (bitmap.width > 8192 || bitmap.height > 8192 || bitmap.width * bitmap.height > MAX_SOURCE_PIXELS) throw Error('圖片最多 838 萬像素，單邊最多 8192 px；請先縮小後匯入。');
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    const project = makeProject({ width: data.width, height: data.height, pixels: data.data }, file.name.replace(/\.[^.]+$/, ''),{compactSource:true});
    const job=await tasks.run('apply',project,{documentId:'import',revision:0,commands:[{op:'rebuild'}]});tasks.forget(project.source);
    replaceProject({...job.result.project,source:project.source}, '圖片已在新分頁匯入。校準格線後按「重建目前圖層」。');dirty=true;documents.get().dirty=true;renderTabs();showPanel('convert');$('compareMode').value='horizontal';updateCompare();
    return {ok:true,id:documents.activeId};
  } catch (error) { message(error.message, true);return {ok:false,error:error.message}; } finally { bitmap?.close(); fileBusy = false; }
}
function download(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function safeName() { return engine.project.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 80) || 'bit-draw'; }
function exportPNG() {
  const p = engine.project, scale = Number($('exportScale').value), raw = document.createElement('canvas'), out = document.createElement('canvas');
  const pixels = composite(p);
  if ($('binaryAlpha').checked) for (let i=3;i<pixels.length;i+=4) { pixels[i] = pixels[i] >= 128 ? 255 : 0; if (!pixels[i]) pixels.fill(0, i-3, i); }
  raw.width = p.width; raw.height = p.height; raw.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pixels), p.width, p.height), 0, 0);
  out.width = p.width * scale; out.height = p.height * scale; const ctx = out.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.drawImage(raw, 0, 0, out.width, out.height);
  out.toBlob(blob => { if (!blob) return message('PNG 匯出失敗', true); download(blob, `${safeName()}-${scale}x.png`); message(`已匯出 ${out.width} × ${out.height} PNG，不含格線或選框。`); }, 'image/png');
}
function demoProject() {
  const tile = document.createElement('canvas'); tile.width = tile.height = 48; const ctx = tile.getContext('2d');
  const rect = (color, x, y, w, h) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };
  // Original procedural test artwork: a tiny botanical exploration robot.
  rect('#162c2e', 12, 39, 24, 3); rect('#274342', 8, 41, 33, 2);
  rect('#152b2b', 15, 31, 6, 9); rect('#152b2b', 27, 31, 6, 9);
  rect('#739e78', 16, 32, 4, 6); rect('#95bb8b', 28, 32, 4, 6);
  rect('#d8e8af', 13, 38, 8, 3); rect('#d8e8af', 27, 38, 8, 3);
  rect('#173936', 10, 22, 28, 10); rect('#173936', 7, 24, 4, 8); rect('#173936', 37, 24, 4, 8);
  rect('#92b78b', 8, 25, 3, 5); rect('#cfde9b', 37, 25, 3, 5);
  rect('#1c4540', 14, 23, 20, 12); rect('#487866', 15, 24, 18, 9); rect('#66957a', 17, 25, 14, 7);
  rect('#e2dca0', 20, 26, 8, 5); rect('#ca995f', 22, 27, 4, 3);
  rect('#152e30', 12, 10, 24, 15); rect('#152e30', 10, 13, 28, 10);
  rect('#78997a', 13, 11, 22, 13); rect('#d4e4b3', 14, 11, 20, 3); rect('#a9c69c', 11, 14, 26, 8);
  rect('#4a7969', 12, 21, 24, 3); rect('#172f34', 15, 15, 18, 7); rect('#26535a', 16, 16, 16, 5);
  rect('#79d2c6', 18, 17, 3, 3); rect('#d9f7cc', 19, 17, 2, 1); rect('#79d2c6', 27, 17, 3, 3); rect('#d9f7cc', 28, 17, 2, 1);
  rect('#345f54', 22, 8, 4, 3); rect('#6b9d57', 23, 4, 2, 5);
  rect('#3e704a', 17, 3, 6, 3); rect('#a2cb68', 18, 3, 4, 2); rect('#42754b', 25, 1, 6, 4); rect('#c7de80', 26, 1, 4, 2);
  rect('#d6c67c', 5, 13, 2, 2); rect('#d6c67c', 40, 8, 2, 2); rect('#87bda4', 4, 36, 2, 2); rect('#87bda4', 40, 32, 2, 2);
  const large = document.createElement('canvas'); large.width = large.height = 384; const lc = large.getContext('2d'); lc.imageSmoothingEnabled = false; lc.drawImage(tile, 0, 0, 384, 384);
  const image = lc.getImageData(0, 0, 384, 384); let seed = 137;
  for (let i = 0; i < image.data.length; i += 4) if (image.data[i + 3]) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = (seed % 19) - 9;
    for (let c = 0; c < 3; c++) image.data[i + c] = Math.max(0, Math.min(255, image.data[i + c] + noise));
  }
  const e = new Engine(makeProject({ width: 384, height: 384, pixels: image.data }, 'BOTANICAL-01 · 紋理示例'));
  e.dispatch({ op: 'rebuild', grid: { cellWidth: 8, cellHeight: 8 } }); e.dispatch({ op: 'palette.reduce', count: 16 });
  return e.project;
}
function point(event) {
  const box = $('resultCanvas').getBoundingClientRect(), p = engine.project;
  return { x: Math.max(0, Math.min(p.width - 1, Math.floor((event.clientX - box.left) / box.width * p.width))), y: Math.max(0, Math.min(p.height - 1, Math.floor((event.clientY - box.top) / box.height * p.height))) };
}
function withinSelection(p) { return !selection || (p.x >= selection.x && p.y >= selection.y && p.x < selection.x + selection.width && p.y < selection.y + selection.height); }
function line(a, b) {
  const points = []; let x = a.x, y = a.y, dx = Math.abs(b.x - x), dy = -Math.abs(b.y - y), err = dx + dy;
  const sx = x < b.x ? 1 : -1, sy = y < b.y ? 1 : -1;
  while (true) { points.push({ x, y }); if (x === b.x && y === b.y) break; const e = 2 * err; if (e >= dy) { err += dy; x += sx; } if (e <= dx) { err += dx; y += sy; } }
  return points;
}
function extendStroke(p) {
  const color = stroke.tool === 'erase' ? [0, 0, 0, 0] : parseColor(stroke.color);
  const size = stroke.size, origin = Math.floor((size - 1) / 2);
  for (const center of line(stroke.last, p)) for (let dy=0;dy<size;dy++) for(let dx=0;dx<size;dx++) {
    const q={x:center.x+dx-origin,y:center.y+dy-origin}; if(q.x<0||q.y<0||q.x>=engine.project.width||q.y>=engine.project.height||!withinSelection(q)) continue;
    const key = q.y * engine.project.width + q.x; stroke.points.set(key, q); stroke.preview.splice(key * 4, 4, ...color);
  }
  stroke.last = p; renderResult();
}
function selectTool(value) {
  tool = value;
  $('toolName').textContent = {paint:'鉛筆',fill:'油漆桶',erase:'橡皮擦',pick:'吸色',select:'矩形選取',pan:'平移'}[tool];
  $('resultCanvas').style.cursor = tool === 'pan' ? 'grab' : 'crosshair';
  for (const btn of $('tools').querySelectorAll('button')) { btn.classList.toggle('active', btn.dataset.tool === tool); btn.setAttribute('aria-pressed', String(btn.dataset.tool === tool)); }
  $('status').textContent = { paint: '鉛筆 B · 在目前圖層繪製', fill: '填色 G · 目前圖層的四向連通區域', erase: '擦除 E · 將像素設為透明', pick: '吸色 I · 取樣可見合成顏色', select: '選取 M · 限制繪圖、縮色與調整範圍', pan:'平移 H · 放大後拖曳移動視圖，也可按住空白鍵' }[tool];
}
let selectStart;
$('resultCanvas').addEventListener('pointerdown', event => attempt(() => {
  if (event.button !== 0 || stroke || pan || tool === 'pan' || spaceDown) return;
  const p = point(event); $('resultCanvas').setPointerCapture(event.pointerId);
  studio?.invalidate();
  if (tool === 'select') { selectStart = p; selection = { ...p, width: 1, height: 1 }; renderAll(); }
  else if (tool === 'pick') { const i = (p.y * engine.project.width + p.x) * 4, px = composite(engine.project); if (px[i + 3]) setColor(toHex(px.slice(i, i + 3))); else message('這一格是透明像素。'); }
  else if (tool === 'fill') execute({ op: 'fill', ...p, color: $('paintColor').value, region: selection });
  else { if (activeLayer().locked || !activeLayer().visible) throw Error('請先顯示並解鎖目前圖層'); stroke = { tool, size: Number($('brushSize').value), color: $('paintColor').value, last: p, points: new Map(), preview: activePixels(engine.project).slice() }; extendStroke(p); }
}));
$('resultCanvas').addEventListener('pointermove', event => {
  const p = point(event); $('pixelPosition').textContent = `X ${String(p.x).padStart(3, '0')}   Y ${String(p.y).padStart(3, '0')}`;
  if (selectStart) { selection = { x: Math.min(p.x, selectStart.x), y: Math.min(p.y, selectStart.y), width: Math.abs(p.x - selectStart.x) + 1, height: Math.abs(p.y - selectStart.y) + 1 }; renderResult(); }
  else if (stroke) extendStroke(p);
});
function finishStroke(cancel = false) {
  selectStart = null;
  if (stroke) { const saved = stroke; stroke = null; if (!cancel && saved.points.size) attempt(() => execute({ op: saved.tool === 'erase' ? 'erase.stroke' : 'paint.stroke', color: saved.color, points: [...saved.points.values()], region: selection })); }
  renderAll();
}
$('resultCanvas').addEventListener('pointerup', () => finishStroke());
$('resultCanvas').addEventListener('pointercancel', () => finishStroke(true));
$('resultCanvas').addEventListener('lostpointercapture', () => { if (stroke || selectStart) finishStroke(true); });
$('tools').onclick = event => { const button = event.target.closest('button'); if (button) selectTool(button.dataset.tool); };
$('clearSelection').onclick = () => { selection = null; studio?.invalidate(); renderAll(); };
$('paintColor').oninput = () => setColor($('paintColor').value);
for (const key of gridKeys) $(key).addEventListener('input', () => { dirty = true;documents.touch();renderTabs(); $('projectName').textContent = engine.project.name + ' •'; gridPreview(); });
$('rebuild').onclick = () => attempt(() => { execute({ op: 'rebuild', grid: readGrid() }); message('已按格線重建。可繼續縮色，或直接修正細節。'); });
$('protectSelection').onclick=()=>attempt(()=>{if(!selection)throw Error('先用矩形選取工具框選眼睛、嘴巴等細節');const current=JSON.parse($('finishProtect').value);current.push({...selection});execute({op:'detail.protect',regions:current});$('finishProtect').value=JSON.stringify(current);message('已加入重要細節保護範圍。');});
$('reduce').onclick = () => attempt(() => { execute({ op: 'palette.reduce', count: Number($('colorCount').value), region: selection }); message(selection ? '已縮減選區色盤；選區以外保留。' : `已縮色，目前共 ${engine.project.palette.length} 色。`); });
$('presets').onclick = event => { const button = event.target.closest('[data-count]'); if (!button) return; $('colorCount').value = button.dataset.count; for (const b of $('presets').children) b.classList.toggle('selected', b === button); };
$('colorCount').oninput = () => { for (const b of $('presets').children) b.classList.toggle('selected', b.dataset.count === $('colorCount').value); };
$('undo').onclick = () => attempt(() => execute({ op: 'undo' })); $('redo').onclick = () => attempt(() => execute({ op: 'redo' }));
$('zoom').onchange = () => {gridPreview();renderResult();}; $('showGrid').onchange = () => { gridPreview(); renderResult(); };
$('import').onclick = () => $('imageInput').click();
$('imageInput').onchange = async event => { const files=[...event.target.files];event.target.value='';for(const file of files)await importImage(file); };
$('demo').onclick = () => { if (okayToReplace()) replaceProject(demoProject(), '已載入程式繪製的紋理測試圖（非 AI 生成圖）。'); };
document.addEventListener('dragover', event => { event.preventDefault(); document.body.classList.add('dragging'); });
document.addEventListener('dragleave', event => { if (!event.relatedTarget) document.body.classList.remove('dragging'); });
document.addEventListener('drop', async event => { event.preventDefault(); document.body.classList.remove('dragging');for(const file of [...event.dataTransfer.files])await importImage(file); });
$('export').onclick = () => attempt(exportPNG);
$('saveProject').onclick = async () => { try {
  // Pending calibration controls belong to the project even before rebuilding.
  const g = readGrid(); validateGrid(g, engine.project.source);
  if (JSON.stringify(g) !== JSON.stringify(engine.project.grid)) execute({ op: 'grid.set', grid: g });
  const d=documents.get(),revision=d.revision,name=safeName();message('背景壓縮專案中…');const job=await tasks.run('pack',d.engine.project);download(new Blob([JSON.stringify(job.result)],{type:'application/json'}),name+'.bitdraw.json');if(d.revision===revision){d.dirty=false;if(d.id===documents.activeId)dirty=false;}renderAll();message('無損壓縮專案已下載；原圖與像素完整保留。');
} catch(error){message(error.message,true);} };
$('openProject').onclick = () => $('projectInput').click();
$('projectInput').onchange = async event => {
  const files = [...event.target.files]; event.target.value = ''; if (!files.length || fileBusy) return;
  fileBusy = true;
  try {for(const file of files){if(!okayToReplace())break;if (file.size > 160 * 1024 * 1024) throw Error('專案檔案上限 160 MB'); replaceProject((await tasks.run('unpack',null,{input:JSON.parse(await file.text())})).result, '專案已在新分頁開啟。');}}
  catch (error) { message(error.message, true); } finally { fileBusy = false; }
};
$('runCommand').onclick = async () => {
  try { const c = JSON.parse($('command').value),d=documents.get();const result = await agentRequest({action:'document.apply',documentId:d.id,expectedRevision:d.revision,commands:Array.isArray(c)?c:[c]}); $('commandResult').textContent = JSON.stringify(result, null, 2); message('指令執行完成。'); }
  catch (error) { $('commandResult').textContent = JSON.stringify({ ok: false, error: error.message }, null, 2); message(error.message, true); }
};
document.addEventListener('keydown', event => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName) || document.querySelector('dialog[open]')) return;
  const key = event.key.toLowerCase();
  if((event.ctrlKey||event.metaKey)&&key==='o'){event.preventDefault();$('openProject').click();return;}
  if(event.altKey&&['pageup','pagedown'].includes(key)){event.preventDefault();if(stroke)return;captureDocument();const i=documents.documents.findIndex(d=>d.id===documents.activeId),step=key==='pageup'?-1:1;activateDocument(documents.documents[(i+step+documents.documents.length)%documents.documents.length].id);return;}
  if ((event.ctrlKey || event.metaKey) && key === 'z') { event.preventDefault(); attempt(() => execute({ op: event.shiftKey ? 'redo' : 'undo' })); return; }
  if ((event.ctrlKey || event.metaKey) && key === 's') { event.preventDefault(); $('saveProject').click(); return; }
  if (event.ctrlKey || event.metaKey || event.altKey || stroke) return;
  if (key === ' ') { event.preventDefault(); spaceDown = true; }
  if (key === 'delete' && selection) { event.preventDefault(); attempt(() => execute({op:'selection.clear',region:selection})); }
  const keys = { b: 'paint', g: 'fill', e: 'erase', i: 'pick', m: 'select', h:'pan' }; if (keys[key]) selectTool(keys[key]);
  if (key === 'escape') { selection = null; studio?.invalidate(); renderAll(); }
});
window.addEventListener('beforeunload', event => { if (dirty||documents.documents.some(d=>d.dirty)) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('resize', () => { gridPreview(); renderResult(); });
function showPanel(name) {
  for (const b of document.querySelectorAll('[data-panel]')) b.classList.toggle('active', b.dataset.panel === name);
  for (const page of document.querySelectorAll('[data-page]')) page.hidden = page.dataset.page !== name;
}
function updateCompare() {const mode=$('compareMode').value;$('compare').checked=mode!=='off';$('comparison').classList.toggle('comparing',['horizontal','vertical'].includes(mode));$('comparison').classList.toggle('vertical',mode==='vertical');$('overlayControls').hidden=mode!=='overlay';$('overlayValue').textContent=$('overlayOpacity').value+'%';$('compareHint').textContent=mode==='overlay'?'原圖疊於成品之上 · 可繼續繪製 · 不影響輸出':'';gridPreview();renderResult();}
document.querySelector('.panel-tabs').onclick = event => { const b = event.target.closest('[data-panel]'); if (b) showPanel(b.dataset.panel); };
$('compareMode').onchange=$('overlayOpacity').oninput=$('syncViews').onchange=updateCompare;
$('inspectorToggle').onclick = () => { document.querySelector('.workspace').classList.toggle('hide-inspector'); gridPreview(); renderResult(); };
$('commandsOpen').onclick = () => $('commandDialog').showModal();
for (const button of document.querySelectorAll('[data-close]')) button.onclick = () => $(button.dataset.close).close();
$('newProject').onclick = () => $('newDialog').showModal();
$('newForm').onsubmit = event => { event.preventDefault(); attempt(() => {
  const width = Number($('newWidth').value), height = Number($('newHeight').value);
  if (![width,height].every(n => Number.isInteger(n) && n>=1 && n<=1024)) throw Error('尺寸需為 1–1024 的整數');
  if (!okayToReplace()) return;
  const project = makeProject({width,height,pixels:new Array(width*height*4).fill(0)}, $('newName').value.trim() || '未命名作品');
  project.grid.cellWidth = project.grid.cellHeight = 1;
  const next = new Engine(project); next.dispatch({op:'rebuild'}); next.project.layers[0].name = '圖層 1';
  replaceProject(next.project, '已建立透明畫布分頁。');dirty=true;documents.get().dirty=true;renderTabs();$('newDialog').close();showPanel('edit');$('compareMode').value='off';updateCompare();
}); };
$('colorHex').onchange = () => attempt(() => setColor($('colorHex').value));
$('colorHex').oninput = () => { if (/^#[0-9a-f]{6}$/i.test($('colorHex').value)) setColor($('colorHex').value); };
for (const id of ['red','green','blue']) $(id).onchange = () => attempt(() => {
  const values = ['red','green','blue'].map(k => Number($(k).value)); if (!values.every(n => Number.isInteger(n)&&n>=0&&n<=255)) throw Error('RGB 必須介於 0–255'); setColor(toHex(values));
});
for (const id of ['red','green','blue']) $(id).oninput = () => {
  const fields = ['red','green','blue'].map(k => $(k).value), values = fields.map(Number);
  if (fields.every(v => v !== '') && values.every(n => Number.isInteger(n)&&n>=0&&n<=255)) setColor(toHex(values));
};
$('clearPixels').onclick = () => attempt(() => { if(selection) execute({op:'selection.clear',region:selection}); });
$('layerAdd').onclick = () => attempt(() => execute({op:'layer.add'}));
$('layerDuplicate').onclick = () => attempt(() => execute({op:'layer.duplicate'}));
$('layerDelete').onclick = () => attempt(() => execute({op:'layer.delete'}));
$('layerMerge').onclick = () => attempt(() => execute({op:'layer.mergeDown'}));
$('layerUp').onclick = () => attempt(() => execute({op:'layer.move',index:engine.project.layers.indexOf(activeLayer())+1}));
$('layerDown').onclick = () => attempt(() => execute({op:'layer.move',index:engine.project.layers.indexOf(activeLayer())-1}));
$('layerRename').onclick = () => attempt(() => execute({op:'layer.update',patch:{name:$('layerName').value.trim()}}));
$('layerOpacity').onchange = () => attempt(() => execute({op:'layer.update',patch:{opacity:Number($('layerOpacity').value)/100}}));
$('layerOpacity').onkeydown = event => { if (event.key === 'Enter') { event.preventDefault(); $('layerOpacity').onchange(); } };
$('layerName').onkeydown = event => { if(event.key==='Enter') $('layerRename').click(); };
$('bookSelect').onchange = () => attempt(() => execute({op:'swatch.select',id:$('bookSelect').value}));
$('bookNew').onclick = () => attempt(() => execute({op:'swatch.save',name:`自訂色盤 ${engine.project.swatchBooks.length+1}`,colors:[]}));
$('bookDelete').onclick = () => attempt(() => execute({op:'swatch.delete'}));
function saveBook(colors = activeBook().colors, name = activeBook().name) { return execute({op:'swatch.save',id:activeBook().id,name,colors}); }
$('bookRename').onclick = () => attempt(() => saveBook(activeBook().colors, $('bookName').value));
$('bookName').onkeydown = event => { if(event.key==='Enter') $('bookRename').click(); };
$('swatchAdd').onclick = () => attempt(() => saveBook([...activeBook().colors,$('paintColor').value]));
$('swatchUpdate').onclick = () => attempt(() => { const colors = activeBook().colors.slice(); if(selectedSwatch<0||selectedSwatch>=colors.length)return; colors[selectedSwatch]=$('paintColor').value; saveBook(colors); });
$('swatchRemove').onclick = () => attempt(() => { if(selectedSwatch>=0) saveBook(activeBook().colors.filter((_,i)=>i!==selectedSwatch)); });
$('paletteExtract').onclick = () => attempt(() => { execute({op:'swatch.save',name:'圖片擷取色盤',colors:engine.project.palette.slice(0,256).map(c=>c.hex)}); message('已建立擷取色盤（最多 256 色）。'); });
$('mapPalette').onclick = () => attempt(() => { execute({op:'palette.map',region:selection}); message('目前圖層已對應至指定色盤，可復原。'); });
$('paletteExport').onclick = () => { const book=activeBook(); download(new Blob([JSON.stringify({format:'bitdraw-palette',version:1,name:book.name,colors:book.colors},null,2)],{type:'application/json'}),'palette.bitdraw.json'); message('色盤已匯出。'); };
$('paletteImport').onclick = () => $('paletteInput').click();
$('paletteInput').onchange = async event => {
  const file=event.target.files[0];event.target.value='';if(!file)return;
  try {if(file.size>100000)throw Error('色盤檔案上限 100 KB'); const book=JSON.parse(await file.text()); if(book.format!=='bitdraw-palette'||book.version!==1)throw Error('請匯入 BIT DRAW 色盤 JSON'); execute({op:'swatch.save',name:book.name,colors:book.colors}); message('自訂色盤已匯入。');}catch(error){message(error.message,true);}
};
$('applyAdjust').onclick = () => attempt(() => {execute({op:'adjust',brightness:Number($('brightness').value),contrast:Number($('contrast').value),region:selection});message('已套用亮度與對比，可復原。');});
$('outline').onclick = () => attempt(() => {execute({op:'outline',color:$('paintColor').value,region:selection});message('已加入 1 px 外描邊。');});
const vp=$('resultViewport');
let synchronizingScroll=false;
for(const [from,to]of [[$('resultViewport'),$('sourceViewport')],[$('sourceViewport'),$('resultViewport')]])from.addEventListener('scroll',()=>{if(synchronizingScroll||!$('syncViews').checked||!$('comparison').classList.contains('comparing'))return;synchronizingScroll=true;const x=from.scrollLeft/Math.max(1,from.scrollWidth-from.clientWidth),y=from.scrollTop/Math.max(1,from.scrollHeight-from.clientHeight);to.scrollLeft=x*Math.max(0,to.scrollWidth-to.clientWidth);to.scrollTop=y*Math.max(0,to.scrollHeight-to.clientHeight);requestAnimationFrame(()=>synchronizingScroll=false);});
vp.addEventListener('pointerdown', event => {
  if(event.button!==0 || (!spaceDown&&tool!=='pan'))return;
  pan={x:event.clientX,y:event.clientY,left:vp.scrollLeft,top:vp.scrollTop};vp.setPointerCapture(event.pointerId);event.preventDefault();
},true);
vp.addEventListener('pointermove',event=>{if(pan){vp.scrollLeft=pan.left-(event.clientX-pan.x);vp.scrollTop=pan.top-(event.clientY-pan.y);}});
for(const type of ['pointerup','pointercancel','lostpointercapture'])vp.addEventListener(type,()=>pan=null);
document.addEventListener('keyup',event=>{if(event.key===' ')spaceDown=false;});
window.addEventListener('blur',()=>{spaceDown=false;pan=null;});
async function agentRequest(request){
  if(!request||typeof request.action!=='string')throw Error('缺少 action');
  if(stroke||selectStart||fileBusy)throw Error('使用者正在繪製／開啟文件，請稍後重新讀取狀態');
  if($('closeDocumentDialog').open||$('renameDocumentDialog').open)throw Error('使用者正在處理文件對話框，請稍後重試');
  captureDocument();
  if(request.action==='capabilities')return capabilities();
  if(request.action==='documents.list')return {ok:true,activeId:documents.activeId,documents:documents.list()};
  if(request.action==='document.pixelPlan'&&(request.framing||request.removeBackground||['model','quality'].includes(request.subjectMode))){const d=documents.get(request.documentId),revision=d.revision,job=await tasks.run('plan',d.engine.project,{options:request});if(d.revision!==revision)throw Error('規劃期間文件已變動');return {ok:true,id:d.id,revision,...job.result};}
  if(automation){const result=await automation.handle(request);if(result!==undefined)return result;}
  if(request.action==='document.import'){
    if(!['image/png','image/jpeg','image/webp'].includes(request.mime)||typeof request.data!=='string'||request.data.length>28*1024*1024)throw Error('圖片格式或大小無效');
    const bytes=Uint8Array.from(atob(request.data),c=>c.charCodeAt(0));const result=await importImage(new File([bytes],String(request.name??'Imported image').slice(0,200),{type:request.mime}));if(!result?.ok)throw Error(result?.error??'圖片匯入失敗，請確認文件數與檔案大小');return {ok:true,...documents.inspect(result.id)};
  }
  if(request.action==='document.open'){if(!request.project)throw Error('缺少 project');replaceProject((await tasks.run('unpack',null,{input:request.project})).result,'代理已開啟文件分頁。');return {ok:true,...documents.inspect()};}
  if(request.action==='document.create'){
    const {width,height}=request;if(![width,height].every(n=>Number.isInteger(n)&&n>=1&&n<=1024))throw Error('畫布尺寸需為 1–1024');
    const p=makeProject({width,height,pixels:new Array(width*height*4).fill(0)},request.name??'代理新文件');p.grid.cellWidth=p.grid.cellHeight=1;const e=new Engine(p);e.dispatch({op:'rebuild'});replaceProject(e.project,'代理已建立文件分頁。');dirty=true;documents.get().dirty=true;$('compareMode').value='off';updateCompare();renderTabs();return {ok:true,...documents.inspect()};
  }
  if(typeof request.documentId!=='string')throw Error('需明確指定 documentId');
  const d=documents.get(request.documentId),p=d.engine.project;
  if(request.action==='document.activate'){activateDocument(d.id);return {ok:true,...documents.inspect(d.id)};}
  if(request.action==='document.view'){
    const v=request.view;if(!v||Object.keys(v).some(k=>!['compareMode','overlayOpacity','syncViews'].includes(k)))throw Error('不支援的檢視設定');
    if(v.compareMode!==undefined&&!['horizontal','vertical','overlay','off'].includes(v.compareMode))throw Error('比對模式無效');if(v.overlayOpacity!==undefined&&(!Number.isInteger(v.overlayOpacity)||v.overlayOpacity<0||v.overlayOpacity>100))throw Error('透明度需為 0–100');if(v.syncViews!==undefined&&typeof v.syncViews!=='boolean')throw Error('syncViews 需為布林值');Object.assign(d.view,v);if(d.id===documents.activeId){if(v.compareMode!==undefined)$('compareMode').value=v.compareMode;if(v.overlayOpacity!==undefined)$('overlayOpacity').value=v.overlayOpacity;if(v.syncViews!==undefined)$('syncViews').checked=v.syncViews;updateCompare();}return {ok:true,id:d.id,view:{compareMode:d.view.compareMode,overlayOpacity:Number(d.view.overlayOpacity),syncViews:d.view.syncViews}};
  }
  const pending=d.view.gridValues&&gridKeys.some(k=>String(p.grid[k])!==String(d.view.gridValues[k]));
  if(request.action==='document.inspect')return {ok:true,...documents.inspect(d.id),pendingGrid:!!pending,view:{compareMode:d.view.compareMode??'horizontal',overlayOpacity:Number(d.view.overlayOpacity??50)}};
  if(request.action==='document.readRegion')return {ok:true,...documents.readRegion(d.id,request.region,request.layerId)};
  if(request.action==='document.palette')return {ok:true,id:d.id,revision:d.revision,...analyzeSource(p.source,request.count??16)};
  if(request.action==='document.apply'){
    if(!Number.isInteger(request.expectedRevision))throw Error('修改必須指定 expectedRevision');
    if(request.dryRun!==undefined&&typeof request.dryRun!=='boolean')throw Error('dryRun 必須為布林值');
    if(pending)throw Error('此文件有尚未套用的格線欄位，請先在介面重建或儲存');
    if(request.expectedRevision!==d.revision)throw Error('版本衝突，請重新 inspect');
    const heavy=Array.isArray(request.commands)&&request.commands.some(c=>['image.pixelize','image.pipeline','image.finish','image.autoFocus','image.cutout','rebuild'].includes(c?.op))&&!request.commands.some(c=>['undo','redo'].includes(c?.op));let result;
    if(heavy){message('背景運算中，可繼續檢視；文件變動將捨棄過期結果。');const revision=d.revision,job=await tasks.run('apply',p,{documentId:d.id,revision,commands:request.commands});captureDocument();if(d.id===documents.activeId&&(stroke||selectStart)||d.view.gridValues&&gridKeys.some(k=>String(d.engine.project.grid[k])!==String(d.view.gridValues[k])))throw Error('背景運算期間筆畫或格線正在變動，結果已捨棄');result=commitTask(documents,d.id,revision,job.result.project,job.result.summary,request.dryRun===true);result.workerMs=job.workerMs;}else result=documents.apply(d.id,request.commands,{expectedRevision:request.expectedRevision,dryRun:request.dryRun===true});
    if(!request.dryRun){d.view.selection=null;delete d.view.gridValues;if(d.id===documents.activeId){dirty=d.dirty;selection=null;studio?.invalidate();selectedSwatch=-1;syncGrid();renderAll();}else renderTabs();message(`代理已修改 ${d.engine.project.name} · r${d.revision} · ${result.changes.pixels} 個合成像素`);}
    return result;
  }
  if(['document.focus','document.focusPreview'].includes(request.action)){if(request.expectedRevision!==d.revision)throw Error('版本衝突，請重新 inspect');const revision=d.revision,job=await tasks.run('focus',p,{options:{kind:request.kind??'auto',subjectMode:request.subjectMode??'fast',subjectThreshold:request.subjectThreshold??.5,preview:request.action==='document.focusPreview'}});if(d.revision!==revision)throw Error('分析期間文件已變動，請重新執行');const r={ok:true,id:d.id,revision,...job.result,workerMs:job.workerMs};if(request.action==='document.focusPreview'){const scale=Math.min(1,512/Math.max(p.source.width,p.source.height)),canvas=document.createElement('canvas');canvas.width=Math.round(p.source.width*scale);canvas.height=Math.round(p.source.height*scale);const ctx=canvas.getContext('2d'),raw=document.createElement('canvas');raw.width=p.source.width;raw.height=p.source.height;raw.getContext('2d').putImageData(new ImageData(Uint8ClampedArray.from(p.source.pixels),raw.width,raw.height),0,0);ctx.drawImage(raw,0,0,canvas.width,canvas.height);const m=r.previewMask;if(m){const data=ctx.getImageData(0,0,canvas.width,canvas.height);for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(!m.pixels[Math.floor(y/canvas.height*m.height)*m.width+Math.floor(x/canvas.width*m.width)]){const i=(y*canvas.width+x)*4;for(let k=0;k<3;k++)data.data[i+k]=Math.round(data.data[i+k]*.25+30);}ctx.putImageData(data,0,0);delete r.previewMask;}ctx.lineWidth=2;const box=(b,color)=>{if(!b)return;ctx.strokeStyle=color;ctx.strokeRect(b.x*scale,b.y*scale,b.width*scale,b.height*scale);};box(r.subject.bounds,'#36dbce');for(const f of r.faces){box(f.bounds,'#ffce40');for(const b of f.features)box(b,'#ff4e9b');}r.png=canvas.toDataURL('image/png').split(',')[1];r.width=canvas.width;r.height=canvas.height;}return r;}
  if(request.action==='document.save'){if(pending)throw Error('格線欄位尚未套用，請先在介面儲存或重建');const revision=d.revision,job=request.encoding==='legacy'?{result:legacyProject(d.engine.project)}:await tasks.run('pack',d.engine.project);return {ok:true,id:d.id,revision,project:job.result};}
  if(request.action==='document.markSaved'){
    if(request.expectedRevision!==d.revision)throw Error('檔案已寫出，但文件又有新修改，保留未儲存標記');d.dirty=false;if(d.id===documents.activeId){dirty=false;renderAll();}else renderTabs();return {ok:true};
  }
  if(request.action==='document.export'){
    const r=request.region??{x:0,y:0,width:p.width,height:p.height};
    if(![r.x,r.y,r.width,r.height].every(Number.isInteger)||r.width<1||r.height<1||r.x<0||r.y<0||r.x+r.width>p.width||r.y+r.height>p.height)throw Error('匯出範圍無效');
    const canvas=document.createElement('canvas');canvas.width=p.width;canvas.height=p.height;canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(composite(p)),p.width,p.height),0,0);
    const scale=request.scale??1;if(!Number.isInteger(scale)||scale<1||scale>16)throw Error('匯出整數倍率需為 1–16');
    const crop=document.createElement('canvas');crop.width=r.width*scale;crop.height=r.height*scale;const cropContext=crop.getContext('2d');cropContext.imageSmoothingEnabled=false;cropContext.drawImage(canvas,r.x,r.y,r.width,r.height,0,0,crop.width,crop.height);
    return {ok:true,id:d.id,revision:d.revision,width:crop.width,height:crop.height,png:crop.toDataURL('image/png').split(',')[1]};
  }
  throw Error('未知代理操作');
}
$('documentDuplicate').onclick=()=>attempt(()=>{if(stroke)throw Error('請先完成筆畫');const copy=structuredClone(engine.project);copy.name=copy.name.slice(0,190)+' 副本';replaceProject(copy,'已建立獨立文件副本。');dirty=true;renderAll();});
$('documentRename').onclick=()=>{$('renameDocumentName').value=engine.project.name;$('renameDocumentDialog').showModal();};
$('renameDocumentForm').onsubmit=e=>{e.preventDefault();attempt(()=>{execute({op:'project.rename',name:$('renameDocumentName').value});$('renameDocumentDialog').close();});};
$('discardDocument').onclick=()=>attempt(()=>{const id=closingDocumentId;$('closeDocumentDialog').close();closingDocumentId=null;if(id)closeDocument(id);});
window.bitdraw = Object.freeze({
  version: '0.9.0',
  getState: () => structuredClone(engine.project),
  dispatch: command => agentRequest({action:'document.apply',documentId:documents.activeId,expectedRevision:documents.get().revision,commands:[command]}),
  batch: commands => agentRequest({action:'document.apply',documentId:documents.activeId,expectedRevision:documents.get().revision,commands}),
  getCapabilities: capabilities,
  request: agentRequest
});
replaceProject(demoProject(), '已載入紋理示例。可匯入圖片或建立空白畫布。'); selectTool('paint'); setColor('#c7e68c');
studio = initStudio({project:()=>engine.project,book:activeBook,color:()=>$('paintColor').value,selection:()=>selection,setColor,execute,render:renderResult,message});
automation=initAutomation({workspace:documents,capture:captureDocument,busy:()=>!!(stroke||selectStart||fileBusy),request:agentRequest,message,restore:(project,view)=>{captureDocument();const d=documents.add(project,{dirty:true});d.view=structuredClone(view??{});activateDocument(d.id);return d.id;}});
connectAgent(agentRequest,(label,id)=>{$('agentStatus').textContent='指令連線：'+label;$('agentStatus').title=id?`Session ${id} · 本機代理可透過 agent.mjs 操作`:'請啟動 server.mjs';});
