// The same deterministic command engine runs in the browser and Node CLI.
import { mixRgb, segmentRegions, outlinePixels, regionOptions } from './color-tools.js';
import {regionIndex} from './region-guide.js';
import {validateLabels,applyLabelCommand,applyRules,invalidateLabels} from './semantic-regions.js';
import {samplingLayout,sampleExact,protectionMask} from './sampling.js';
import {setProtection,validateProtection,cutout,finishPixels} from './pixel-finish.js';
import {pixelPlan} from './pixel-plan.js';
import {applyAutoLabels,applyMask} from './auto-regions.js';
import {labelState} from './semantic-regions.js';
import {detectFocus,projectFocus,focusSummary} from './auto-focus.js';
export const VERSION = 5;
export const MAX_LAYERS = 16;
export const MAX_SOURCE_PIXELS = 8_388_608;
export const MAX_OUTPUT = 1024;
const clone = x => structuredClone(x);
function integer(n, min, max, label) {
  if (!Number.isInteger(n) || n < min || n > max) throw Error(`${label} 必須是 ${min}–${max} 的整數`);
  return n;
}
function pixelsOK(p, length) {
  if (!p || p.length !== length) throw Error('像素資料無效');
  if(p instanceof Uint8Array||p instanceof Uint8ClampedArray)return;
  for(let i=0;i<length;i++)if(!Number.isInteger(p[i])||p[i]<0||p[i]>255)throw Error('像素資料無效');
}
export function validateSource(s) {
  if (!s) throw Error('缺少原始圖片');
  integer(s.width, 1, 8192, '圖片寬度'); integer(s.height, 1, 8192, '圖片高度');
  if (s.width * s.height > MAX_SOURCE_PIXELS) throw Error('圖片最多 838 萬像素，請先縮小');
  pixelsOK(s.pixels, s.width * s.height * 4);
  return s;
}
export function validateGrid(g, source) {
  integer(g.cellWidth, 1, 8192, '格寬'); integer(g.cellHeight, 1, 8192, '格高');
  integer(g.offsetX, 0, source.width - 1, 'X 起點'); integer(g.offsetY, 0, source.height - 1, 'Y 起點');
  integer(g.alphaThreshold, 1, 255, '透明門檻');
  if (!['dominant', 'center', 'average'].includes(g.method)) throw Error('未知取樣方式');
  if(g.output){const {width,height}=samplingLayout(source,g.output);return {width,height};}
  const width = Math.ceil((source.width - g.offsetX) / g.cellWidth);
  const height = Math.ceil((source.height - g.offsetY) / g.cellHeight);
  if (width > MAX_OUTPUT || height > MAX_OUTPUT) throw Error('輸出最大 1024 × 1024，請增加格子尺寸');
  return { width, height };
}
export function defaultGrid(source) {
  const cell = Math.max(1, Math.ceil(Math.max(source.width, source.height) / 48));
  return { cellWidth: cell, cellHeight: cell, offsetX: 0, offsetY: 0, method: 'dominant', alphaThreshold: 128 };
}
export function makeProject(source, name = 'Untitled', {compactSource=false}={}) {
  validateSource(source);
  return {
    format: 'bitdraw', version: VERSION, name: String(name).slice(0, 200),
    source: { width: source.width, height: source.height, pixels: compactSource?Uint8Array.from(source.pixels):Array.from(source.pixels) },
    grid: defaultGrid(source), width: 1, height: 1, palette: [],
    layers: [{ id: 'layer-1', name: '像素重建', visible: true, locked: false, opacity: 1, type: 'raster' }],
    swatchBooks: [{ id: 'book-1', name: '我的色盤', colors: ['#172c3c','#38606b','#79b4a9','#d3e3b0','#f1bd75','#ca715b','#704a68','#292536'] }], activeBookId: 'book-1',
    frames: [{ id: 'frame-1', durationMs: 100, cels: { 'layer-1': [0, 0, 0, 0] } }],
    activeLayerId: 'layer-1', activeFrameId: 'frame-1',
    metadata: { anchors: [], directions: [], extensions: {} }
  };
}
export function activePixels(p) {
  const frame = p.frames.find(f => f.id === p.activeFrameId);
  if (!frame?.cels[p.activeLayerId]) throw Error('找不到使用中的影格／圖層');
  return frame.cels[p.activeLayerId];
}
export function validateProject(p) {
  if (!p || p.format !== 'bitdraw' || p.version !== VERSION) throw Error('不支援的 BIT DRAW 專案版本');
  validateSource(p.source); validateGrid(p.grid, p.source);
  integer(p.width, 1, MAX_OUTPUT, '畫布寬度'); integer(p.height, 1, MAX_OUTPUT, '畫布高度');
  if (!Array.isArray(p.layers) || !p.layers.length || p.layers.length > MAX_LAYERS || !Array.isArray(p.frames) || p.frames.length !== 1) throw Error('支援 1–16 個圖層、單一影格');
  const f = p.frames[0], ids = new Set();
  if (!f.cels || Object.keys(f.cels).length !== p.layers.length || f.id !== p.activeFrameId) throw Error('影格內容無效');
  for (const l of p.layers) {
    if (!/^layer-\d+$/.test(l.id) || ids.has(l.id) || typeof l.name !== 'string' || !l.name.trim() || l.name.length > 80 || typeof l.visible !== 'boolean' || typeof l.locked !== 'boolean' || !Number.isFinite(l.opacity) || l.opacity < 0 || l.opacity > 1 || l.type !== 'raster') throw Error('圖層資料無效');
    ids.add(l.id); pixelsOK(f.cels[l.id], p.width * p.height * 4);
  }
  if (!ids.has(p.activeLayerId)) throw Error('使用中圖層無效');
  if (!Array.isArray(p.swatchBooks) || !p.swatchBooks.length || p.swatchBooks.length > 32) throw Error('色盤庫無效');
  const books = new Set();
  for (const b of p.swatchBooks) {
    if (!/^book-\d+$/.test(b.id) || books.has(b.id)) throw Error('色盤識別碼無效');
    books.add(b.id); validateBook(b);
  }
  if (!books.has(p.activeBookId)) throw Error('使用中色盤無效');
  if (!Array.isArray(p.palette) || p.palette.length > MAX_OUTPUT*MAX_OUTPUT) throw Error('色盤資料無效');
  if (typeof p.name !== 'string' || p.name.length > 200) throw Error('專案名稱無效');
  validateLabels(p); validateProtection(p);
  return p;
}
export function migrateProject(input) {
  const p = clone(input);
  if (p?.format === 'bitdraw' && p.version === 1) {
    if (!Array.isArray(p.layers)) throw Error('舊專案圖層無效');
    p.version = VERSION; p.layers = p.layers.map(l => ({ ...l, locked: false }));
    p.swatchBooks = [{ id: 'book-1', name: '我的色盤', colors: [] }]; p.activeBookId = 'book-1';
  }
  if(p?.format==='bitdraw'&&[2,3,4].includes(p.version))p.version=VERSION;
  return validateProject(p);
}
function validateBook(b) {
  if (typeof b.name !== 'string' || !b.name.trim() || b.name.length > 60 || !Array.isArray(b.colors) || b.colors.length > 256) throw Error('色盤需有名稱且最多 256 色');
  b.colors.forEach(parseColor); return b;
}
export function composite(p, override = null, layers = p.layers) {
  const out = new Array(p.width * p.height * 4).fill(0), f = p.frames.find(f => f.id === p.activeFrameId);
  for (const l of layers) {
    if (!l.visible || !l.opacity) continue;
    const src = override && l.id === p.activeLayerId ? override : f.cels[l.id];
    for (let i = 0; i < out.length; i += 4) {
      const a = src[i + 3] / 255 * l.opacity; if (!a) continue;
      const b = out[i + 3] / 255, alpha = a + b * (1 - a);
      for (let c = 0; c < 3; c++) out[i + c] = Math.round((src[i + c] * a + out[i + c] * b * (1 - a)) / alpha);
      out[i + 3] = Math.round(alpha * 255);
    }
  }
  return out;
}
export function mapPalette(pixels, colors, width, height, region) {
  if (!Array.isArray(colors) || !colors.length || colors.length > 256) throw Error('請先在色盤加入 1–256 色');
  const palette = colors.map(parseColor), out = pixels.slice(), r = regionOK(region, width, height);
  for (let y = r.y; y < r.y + r.height; y++) for (let x = r.x; x < r.x + r.width; x++) {
    const i = (y * width + x) * 4; if (!out[i + 3]) continue;
    let best, distance = Infinity;
    for (const color of palette) { const d = 2 * (color[0] - out[i]) ** 2 + 4 * (color[1] - out[i + 1]) ** 2 + (color[2] - out[i + 2]) ** 2; if (d < distance) { best = color; distance = d; } }
    out.splice(i, 3, ...best.slice(0, 3));
  }
  return out;
}
const newId = (items, prefix) => `${prefix}-${Math.max(0, ...items.map(x => Number(x.id.split('-')[1]))) + 1}`;
function editable(p) {
  const l = p.layers.find(l => l.id === p.activeLayerId);
  if (l.locked) throw Error('圖層已鎖定，請先解鎖');
  if (!l.visible) throw Error('請先顯示目前圖層再編輯');
  return l;
}
export function reconstruct(source, grid) {
  if(grid.output){validateGrid(grid,source);return sampleExact(source,grid);}
  const { width, height } = validateGrid(grid, source);
  const pixels = new Array(width * height * 4).fill(0), src = source.pixels;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const x0 = grid.offsetX + x * grid.cellWidth, y0 = grid.offsetY + y * grid.cellHeight;
    const x1 = Math.min(source.width, x0 + grid.cellWidth), y1 = Math.min(source.height, y0 + grid.cellHeight);
    const groups = new Map(); let opaque = 0, sr = 0, sg = 0, sb = 0;
    for (let sy = y0; sy < y1; sy++) for (let sx = x0; sx < x1; sx++) {
      const i = (sy * source.width + sx) * 4;
      if (src[i + 3] < grid.alphaThreshold) continue;
      opaque++; sr += src[i]; sg += src[i + 1]; sb += src[i + 2];
      if (grid.method === 'dominant') {
        // 5-bit buckets tolerate small AI texture/noise without blending across edges.
        const key = (src[i] >> 3) * 1024 + (src[i + 1] >> 3) * 32 + (src[i + 2] >> 3);
        const g = groups.get(key) || [0, 0, 0, 0];
        g[0]++; g[1] += src[i]; g[2] += src[i + 1]; g[3] += src[i + 2]; groups.set(key, g);
      }
    }
    let color;
    if (grid.method === 'center') {
      const i = ((y0 + Math.floor((y1 - y0) / 2)) * source.width + x0 + Math.floor((x1 - x0) / 2)) * 4;
      if (src[i + 3] >= grid.alphaThreshold) color = src.slice(i, i + 3);
    } else if (opaque >= (x1 - x0) * (y1 - y0) / 2) {
      if (grid.method === 'average') color = [sr / opaque, sg / opaque, sb / opaque];
      else {
        let best = [0]; for (const g of groups.values()) if (g[0] > best[0]) best = g;
        color = best.slice(1).map(v => v / best[0]);
      }
    }
    if (color) pixels.splice((y * width + x) * 4, 4, ...color.map(Math.round), 255);
  }
  return { width, height, pixels };
}
export const toHex = c => '#' + c.slice(0, 3).map(x => x.toString(16).padStart(2, '0')).join('');
export function parseColor(c) {
  if (typeof c !== 'string' || !/^#[0-9a-f]{6}$/i.test(c)) throw Error('顏色格式必須是 #RRGGBB');
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 255];
}
export function paletteOf(pixels) {
  const colors = new Map();
  for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3]) {
    const hex = toHex(pixels.slice(i, i + 3)); colors.set(hex, (colors.get(hex) || 0) + 1);
  }
  return [...colors].sort((a, b) => b[1] - a[1]).map(([hex, count]) => ({ hex, count }));
}
function regionOK(r, w, h) {
  if (!r) return { x: 0, y: 0, width: w, height: h };
  integer(r.x, 0, w - 1, '區域 X'); integer(r.y, 0, h - 1, '區域 Y');
  integer(r.width, 1, w - r.x, '區域寬度'); integer(r.height, 1, h - r.y, '區域高度');
  return r;
}
function inRegion(x, y, r) { return x >= r.x && y >= r.y && x < r.x + r.width && y < r.y + r.height; }
export function quantize(pixels, width, height, count, region, weights) {
  integer(count, 2, 64, '色數'); const r = regionOK(region, width, height);
  const hist = new Map();
  for (let y = r.y; y < r.y + r.height; y++) for (let x = r.x; x < r.x + r.width; x++) {
    const i = (y * width + x) * 4; if (!pixels[i + 3]) continue;
    const key = pixels[i] * 65536 + pixels[i + 1] * 256 + pixels[i + 2];
    if (!hist.has(key)) hist.set(key, { rgb: pixels.slice(i, i + 3), n: 0 }); hist.get(key).n+=weights?.[y*width+x]?8:1;
  }
  if (hist.size <= count) return pixels.slice();
  const describe = values => {
    const range = [0, 1, 2].map(c => { let lo = 255, hi = 0; for (const v of values) { lo = Math.min(lo, v.rgb[c]); hi = Math.max(hi, v.rgb[c]); } return hi - lo; });
    return { values, range, n: values.reduce((s, v) => s + v.n, 0), spread: Math.max(...range) };
  };
  const boxes = [describe([...hist.values()])];
  while (boxes.length < count) {
    boxes.sort((a, b) => (b.values.length > 1 ? b.spread * b.n : -1) - (a.values.length > 1 ? a.spread * a.n : -1));
    const box = boxes.shift(); if (box.values.length < 2) { boxes.push(box); break; }
    const axis = box.range.indexOf(box.spread), values = box.values.sort((a, b) => a.rgb[axis] - b.rgb[axis]);
    let sum = 0, cut = 1;
    for (let i = 0; i < values.length - 1; i++) { sum += values[i].n; cut = i + 1; if (sum >= box.n / 2) break; }
    boxes.push(describe(values.slice(0, cut)), describe(values.slice(cut)));
  }
  const palette = boxes.map(b => [0, 1, 2].map(c => Math.round(b.values.reduce((s, v) => s + v.rgb[c] * v.n, 0) / b.n)));
  const result = pixels.slice(), cache = new Map();
  for (let y = r.y; y < r.y + r.height; y++) for (let x = r.x; x < r.x + r.width; x++) {
    const i = (y * width + x) * 4; if (!pixels[i + 3]) continue;
    const key = pixels[i] * 65536 + pixels[i + 1] * 256 + pixels[i + 2];
    if (!cache.has(key)) {
      let best = palette[0], distance = Infinity;
      for (const c of palette) {
        const d = 2 * (c[0] - pixels[i]) ** 2 + 4 * (c[1] - pixels[i + 1]) ** 2 + (c[2] - pixels[i + 2]) ** 2;
        if (d < distance) { distance = d; best = c; }
      }
      cache.set(key, best);
    }
    result.splice(i, 3, ...cache.get(key));
  }
  return result;
}
export function analyzeSource(source, count=16) {
  validateSource(source); integer(count,2,64,'分析色數');
  const total=source.width*source.height, samples=Math.min(total,65536), pixels=[];
  // Deterministic stratified sampling with jitter avoids a fixed stride locking onto sprite grids.
  let state=7349;
  for(let n=0;n<samples;n++) { state=(Math.imul(state,1664525)+1013904223)>>>0;
    const i=Math.min(total-1,Math.floor((n+state/4294967296)*total/samples))*4;
    pixels.push(...source.pixels.slice(i,i+4));
  }
  const colors=paletteOf(quantize(pixels,samples,1,count));
  const visible=colors.reduce((n,c)=>n+c.count,0);
  return {colors:colors.map(c=>({...c,percent:c.count/visible*100})),samples,total,visible,estimated:samples<total};
}
export class Engine {
  constructor(project) { this.project = migrateProject(project); this.project.palette = paletteOf(composite(this.project)); this.history = []; this.future = []; }
  snapshot() { const { source, ...rest } = this.project; return clone(rest); }
  restore(s) { this.project = { ...clone(s), source: this.project.source }; }
  dispatch(command) {
    if (!command || typeof command.op !== 'string') throw Error('指令缺少 op');
    if (command.op === 'undo' || command.op === 'redo') {
      const from = command.op === 'undo' ? this.history : this.future, to = command.op === 'undo' ? this.future : this.history;
      if (from.length) { to.push(this.snapshot()); this.restore(from.pop()); } return this.project;
    }
    if (command.op === 'layer.select') { if (!this.project.layers.some(l => l.id === command.id)) throw Error('圖層不存在'); this.project.activeLayerId = command.id; return this.project; }
    if (command.op === 'swatch.select') { if (!this.project.swatchBooks.some(b => b.id === command.id)) throw Error('色盤不存在'); this.project.activeBookId = command.id; return this.project; }
    const before = this.snapshot();
    try { this.apply(command); } catch (e) { this.restore(before); throw e; }
    this.project.palette = paletteOf(composite(this.project));
    this.history.push(before); if (this.history.length > 32) this.history.shift(); this.future = [];
    const weight = s => s.width * s.height * 4 * s.layers.length;
    while (this.history.length > 1 && this.history.reduce((n, s) => n + weight(s), 0) > 8_388_608) this.history.shift();
    return this.project;
  }
  apply(c) {
    const p = this.project;
    if(c.op==='detail.protect'){editable(p);setProtection(p,c.regions);return;}
    if(c.op==='image.autoFocus'){editable(p);const result=detectFocus(p.source,c),mapped=projectFocus(p,result);setProtection(p,mapped.protect);p.metadata.extensions.autoFocus={...focusSummary(result),protectedRegions:mapped.protect.length,subjectBounds:mapped.subjectBounds};return;}
    if(c.op==='image.cutout'){editable(p);if(c.autoSubject){const result=detectFocus(p.source,c);if(result.subject.reliability==='none'||result.subject.reliability!=='high'&&!c.allowUncertain)throw Error('主體邊界需人工確認；先 focus 預覽，或明確 allowUncertain');const {mask}=projectFocus(p,result),px=activePixels(p);for(let i=0;i<mask.length;i++)if(!mask[i])px.fill(0,i*4,i*4+4);}else cutout(p,c);return;}
    if(c.op==='image.finish'){editable(p);if(c.detailMode!==undefined&&!['balanced','strong','crisp'].includes(c.detailMode))throw Error('細節模式需 balanced/strong/crisp');for(const key of ['autoProtect','restoreDetails'])if(c[key]!==undefined&&typeof c[key]!=='boolean')throw Error(`${key} 需為布林值`);if(c.autoProtect&&c.protect!==undefined)throw Error('autoProtect 與 protect 請擇一');if(c.autoProtect)this.apply({op:'image.autoFocus',kind:c.kind??'auto',subjectMode:c.removeBackground||c.subjectMode||'fast',subjectThreshold:c.subjectThreshold});const protect=c.protect??p.metadata?.extensions?.detailProtection?.regions??[],restore=c.restoreDetails&&(!c.autoProtect||protect.length>0);if(restore&&!p.grid.output)throw Error('細節還原請先使用精確尺寸像素化');const detail=restore?sampleExact(p.source,p.grid,{protect,onlyProtected:true,detailMode:c.detailMode??'strong'}).pixels:undefined;finishPixels(p,{...c,restoreDetails:!!restore},detail);return;}
    if(c.op==='region.autolabel'){applyAutoLabels(p,c);return;}
    if(c.op==='region.mask'){applyMask(p,c);return;}
    if(c.op==='image.pipeline'){
      if(c.layerId!==undefined&&c.layerId!==p.activeLayerId)throw Error('pipeline 需使用目前圖層');
      this.apply({...c,finish:undefined,op:'image.pixelize'});
      applyAutoLabels(p,{...c,replace:c.replace});
      if(c.rules){const labelIds=labelState(p).labels.filter(l=>l.layerId===p.activeLayerId&&!l.stale&&l.category!=='unclassified').map(l=>l.id);if(labelIds.length)this.apply({op:'region.rules.apply',rules:c.rules,labelIds,reference:c.reference});}
      if(c.finish)this.apply({subjectMode:c.removeBackground||c.subjectMode||'fast',subjectThreshold:c.subjectThreshold,...c.finish,op:'image.finish'});
      return;
    }
    if(['region.label','region.label.update','region.label.delete'].includes(c.op)){applyLabelCommand(p,c);return;}
    if(c.op==='region.rules.apply'){if(!['current','source'].includes(c.reference??'current'))throw Error('reference 需 current 或 source');let reference;if(c.reference==='source'){const r=reconstruct(p.source,p.grid);if(r.width!==p.width||r.height!==p.height)throw Error('原圖格線與畫布尺寸不符');reference=r.pixels;}applyRules(p,c,reference);return;}
    if(c.op==='image.pixelize'){
      if(c.featureMode!==undefined&&!['balanced','crisp'].includes(c.featureMode))throw Error('featureMode 需 balanced/crisp');
      if(c.preserveFeatures!==undefined&&typeof c.preserveFeatures!=='boolean')throw Error('preserveFeatures 需為布林值');
      if(c.preserveFeatures&&c.protect!==undefined)throw Error('preserveFeatures 與 protect 請擇一');
      if(c.preserveFeatures&&(c.width===undefined||c.height===undefined))throw Error('五官優先縮色需指定精確寬高');
      const plan=pixelPlan(p.source,c);this.apply({op:'rebuild',grid:plan.grid});
      if(c.preserveFeatures){this.apply({op:'image.autoFocus',kind:c.kind??'auto',subjectMode:c.removeBackground||c.subjectMode||'fast',subjectThreshold:c.subjectThreshold});const regions=p.metadata.extensions.detailProtection.regions,mask=protectionMask(regions,p.width,p.height),px=activePixels(p),detail=sampleExact(p.source,p.grid,{protect:regions,onlyProtected:true,detailMode:c.featureMode??'balanced'}).pixels;for(let i=0;i<mask.length;i++)if(mask[i]&&px[i*4+3]&&detail[i*4+3])px.splice(i*4,3,...detail.slice(i*4,i*4+3));p.frames[0].cels[p.activeLayerId]=quantize(px,p.width,p.height,plan.colors,undefined,mask);p.metadata.extensions.featureSampling={regions:regions.length,mode:c.featureMode??'balanced',paletteWeight:8,smallRegions:regions.filter(r=>r.width<3||r.height<2).length};}
      else this.apply({op:'palette.reduce',count:plan.colors});if(c.protect)setProtection(p,c.protect);if(c.finish)this.apply({...c.finish,op:'image.finish'});return;
    }
    if(c.op==='project.rename'){if(typeof c.name!=='string'||!c.name.trim()||c.name.trim().length>200)throw Error('文件名稱需為 1–200 字');p.name=c.name.trim();return;}
    const frame = p.frames.find(f => f.id === p.activeFrameId);
    const index = p.layers.findIndex(l => l.id === p.activeLayerId), layer = p.layers[index];
    if (c.op === 'layer.add' || c.op === 'layer.duplicate') {
      if (p.layers.length >= MAX_LAYERS) throw Error('最多 16 個圖層');
      const id = newId(p.layers, 'layer');
      const name = String(c.name ?? (c.op === 'layer.duplicate' ? layer.name.slice(0, 70) + ' 副本' : `圖層 ${p.layers.length + 1}`)).trim();
      if (!name || name.length > 80) throw Error('圖層名稱需為 1–80 字');
      const item = c.op === 'layer.duplicate' ? { ...layer, id, name, locked: false } : { id, name, visible: true, locked: false, opacity: 1, type: 'raster' };
      p.layers.splice(index + 1, 0, item); frame.cels[id] = c.op === 'layer.duplicate' ? activePixels(p).slice() : new Array(p.width * p.height * 4).fill(0); p.activeLayerId = id; return;
    }
    if (c.op === 'layer.update') {
      const target = p.layers.find(l => l.id === (c.id ?? p.activeLayerId)); if (!target) throw Error('圖層不存在');
      const patch = c.patch; if (!patch || Object.keys(patch).some(k => !['name','visible','locked','opacity'].includes(k))) throw Error('不支援的圖層屬性');
      if ('name' in patch && (typeof patch.name !== 'string' || !patch.name.trim() || patch.name.length > 80)) throw Error('圖層名稱需為 1–80 字');
      for (const key of ['visible','locked']) if (key in patch && typeof patch[key] !== 'boolean') throw Error('顯示／鎖定需為布林值');
      if ('opacity' in patch && (!Number.isFinite(patch.opacity) || patch.opacity < 0 || patch.opacity > 1)) throw Error('透明度需介於 0 與 1');
      Object.assign(target, patch); return;
    }
    if (c.op === 'layer.move') {
      if (layer.locked) throw Error('圖層已鎖定');
      const to = integer(c.index, 0, p.layers.length - 1, '圖層順序'); p.layers.splice(index, 1); p.layers.splice(to, 0, layer); return;
    }
    if (c.op === 'layer.delete') {
      if (layer.locked) throw Error('圖層已鎖定'); if (p.layers.length === 1) throw Error('至少保留一個圖層');
      invalidateLabels(p,[layer.id],'圖層已刪除');p.layers.splice(index, 1); delete frame.cels[layer.id]; p.activeLayerId = p.layers[Math.max(0, index - 1)].id; return;
    }
    if (c.op === 'layer.mergeDown') {
      editable(p); if (!index) throw Error('底層沒有可合併的圖層');
      const below = p.layers[index - 1]; if (below.locked || !below.visible) throw Error('下方圖層需可見且未鎖定');
      frame.cels[below.id] = composite(p, null, [below, layer]); below.opacity = 1;
      invalidateLabels(p,[below.id,layer.id],'圖層已合併，請重新指定範圍');
      p.layers.splice(index, 1); delete frame.cels[layer.id]; p.activeLayerId = below.id; return;
    }
    if (c.op === 'swatch.save') {
      const book = validateBook({ name: c.name, colors: c.colors }); const target = c.id ? p.swatchBooks.find(b => b.id === c.id) : null;
      if (c.id && !target) throw Error('色盤不存在');
      if (!target && p.swatchBooks.length >= 32) throw Error('最多儲存 32 組色盤');
      const normalized = { name: book.name.trim(), colors: [...new Set(book.colors.map(x => x.toLowerCase()))] };
      if (target) Object.assign(target, normalized);
      else { const id = newId(p.swatchBooks, 'book'); p.swatchBooks.push({ id, ...normalized }); p.activeBookId = id; } return;
    }
    if (c.op === 'swatch.delete') {
      if (p.swatchBooks.length === 1) throw Error('至少保留一組色盤');
      const i = p.swatchBooks.findIndex(b => b.id === (c.id ?? p.activeBookId)); if (i < 0) throw Error('色盤不存在');
      const [removed] = p.swatchBooks.splice(i, 1); if (p.activeBookId === removed.id) p.activeBookId = p.swatchBooks[0].id; return;
    }
    if (c.op === 'palette.analyze') {
      const result=analyzeSource(p.source,c.count??16);
      if(!result.colors.length)throw Error('原圖沒有非透明顏色');
      this.apply({op:'swatch.save',name:c.name??'原圖分析色盤',colors:result.colors.map(v=>v.hex)});return;
    }
    if (c.op === 'palette.mix') {
      const color=toHex(mixRgb(parseColor(c.a),parseColor(c.b),c.percent??50));
      const book=p.swatchBooks.find(b=>b.id===p.activeBookId);
      this.apply({op:'swatch.save',id:book.id,name:book.name,colors:[...new Set([...book.colors,color])]});return;
    }
    if (c.op === 'swatch.replace') {
      if(!Array.isArray(c.from)||!c.from.length||c.from.length>256)throw Error('請指定要替換的色卡');
      const from=c.from.map(v=>toHex(parseColor(v))),color=toHex(parseColor(c.color));
      const book=p.swatchBooks.find(b=>b.id===p.activeBookId);
      if(!book.colors.some(v=>from.includes(v.toLowerCase())))throw Error('目前工作色盤沒有 A／B 色卡，請先建立原圖工作色盤或選取對應色盤');
      this.apply({op:'swatch.save',id:book.id,name:book.name,colors:[...new Set(book.colors.map(v=>from.includes(v.toLowerCase())?color:v.toLowerCase()))]});return;
    }
    if (c.op === 'grid.set') { const grid = { ...p.grid, ...c.grid }; validateGrid(grid, p.source); p.grid = grid; return; }
    if (c.op === 'rebuild') {
      editable(p);
      const grid = { ...p.grid, ...c.grid }, result = reconstruct(p.source, grid);
      if (p.layers.length > 1 && (p.width !== result.width || p.height !== result.height)) throw Error('多圖層重建需維持畫布尺寸；請在新專案重新校準');
      invalidateLabels(p,p.layers.map(l=>l.id),'原圖已重建，請重新指定範圍');
      if(p.metadata?.extensions){delete p.metadata.extensions.detailProtection;delete p.metadata.extensions.autoFocus;}
      p.grid = grid; p.width = result.width; p.height = result.height;
      p.frames[0].cels[p.activeLayerId] = result.pixels; return;
    }
    const px = activePixels(p), r = regionOK(c.region, p.width, p.height);
    editable(p);
    if(c.op==='paint.rect'){
      const x=integer(c.x,0,p.width-1,'X'),y=integer(c.y,0,p.height-1,'Y'),width=integer(c.width,1,p.width-x,'寬'),height=integer(c.height,1,p.height-y,'高'),color=parseColor(c.color);
      if(c.filled!==undefined&&typeof c.filled!=='boolean')throw Error('filled 必須為布林值');
      for(let yy=y;yy<y+height;yy++)for(let xx=x;xx<x+width;xx++)if(inRegion(xx,yy,r)&&(c.filled!==false||xx===x||yy===y||xx===x+width-1||yy===y+height-1))px.splice((yy*p.width+xx)*4,4,...color);return;
    }
    if(c.op==='paint.line'){
      let x=integer(c.from?.x,0,p.width-1,'起點 X'),y=integer(c.from?.y,0,p.height-1,'起點 Y');const x1=integer(c.to?.x,0,p.width-1,'終點 X'),y1=integer(c.to?.y,0,p.height-1,'終點 Y'),color=parseColor(c.color);
      const dx=Math.abs(x1-x),dy=-Math.abs(y1-y),sx=x<x1?1:-1,sy=y<y1?1:-1;let error=dx+dy;
      while(true){if(inRegion(x,y,r))px.splice((y*p.width+x)*4,4,...color);if(x===x1&&y===y1)break;const e=2*error;if(e>=dy){error+=dy;x+=sx;}if(e<=dx){error+=dx;y+=sy;}}return;
    }
    if (c.op === 'color.replace') {
      if(!Array.isArray(c.from)||!c.from.length||c.from.length>256)throw Error('請指定 1–256 個來源色');
      const from=c.from.map(parseColor),color=parseColor(c.color),{tolerance}=regionOptions({...c,tolerance:c.tolerance??0});
      let matched=0;
      for(let y=r.y;y<r.y+r.height;y++)for(let x=r.x;x<r.x+r.width;x++){
        const i=(y*p.width+x)*4;if(px[i+3]&&from.some(a=>a.slice(0,3).every((v,k)=>Math.abs(v-px[i+k])<=tolerance))){px.splice(i,3,...color.slice(0,3));matched++;}
      }if(!matched)throw Error('目前圖層／選區沒有符合的顏色，請提高色差容許值或重新取色');return;
    }
    if(c.op==='region.paint'||c.op==='region.paintVerified') {
      const x=integer(c.x,0,p.width-1,'區域 X'),y=integer(c.y,0,p.height-1,'區域 Y'),color=parseColor(c.color);
      const verified=c.op==='region.paintVerified';
      if(verified&&c.layerId!==p.activeLayerId)throw Error('區域圖層不符，請先選取指定圖層');
      const result=verified?regionIndex(px,p.width,p.height,c):segmentRegions(px,p.width,p.height,c),id=result.labels[y*p.width+x];
      if(id<0)throw Error('請選取非透明區域');
      if(verified&&result.regions[id].id!==c.regionId)throw Error('區域形狀已變動，請重新分析；未修改像素');
      for(let y=r.y;y<r.y+r.height;y++)for(let x=r.x;x<r.x+r.width;x++){const pos=y*p.width+x;if(result.labels[pos]===id)px.splice(pos*4,3,...color.slice(0,3));}return;
    }
    if(c.op==='outline.auto') {
      if(p.layers.length>=MAX_LAYERS)throw Error('最多 16 個圖層');
      const pixels=outlinePixels(px,p.width,p.height,{...c,region:r,rgb:parseColor(c.color)});
      if(!pixels.some((v,i)=>i%4===3&&v))throw Error('沒有可描邊像素；外描邊需要畫布內的透明空間');
      const id=newId(p.layers,'layer');p.layers.splice(index+1,0,{id,name:'自動描邊',visible:true,locked:false,opacity:1,type:'raster'});
      frame.cels[id]=pixels;p.activeLayerId=id;return;
    }
    if (c.op === 'palette.map') { frame.cels[p.activeLayerId] = mapPalette(px, c.colors ?? p.swatchBooks.find(b => b.id === p.activeBookId).colors, p.width, p.height, c.region); return; }
    if (c.op === 'adjust') {
      const brightness = integer(c.brightness ?? 0, -100, 100, '亮度'), contrast = integer(c.contrast ?? 0, -100, 100, '對比');
      const factor = (100 + contrast) / 100;
      for (let y = r.y; y < r.y + r.height; y++) for (let x = r.x; x < r.x + r.width; x++) {
        const i = (y * p.width + x) * 4; if (!px[i + 3]) continue;
        for (let k = 0; k < 3; k++) px[i + k] = Math.round(Math.max(0, Math.min(255, (px[i + k] - 128) * factor + 128 + brightness * 2.55)));
      } return;
    }
    if (c.op === 'outline') {
      const color = parseColor(c.color), original = px.slice();
      for (let y = r.y; y < r.y + r.height; y++) for (let x = r.x; x < r.x + r.width; x++) {
        const i = (y * p.width + x) * 4; if (original[i + 3]) continue;
        if ([[x-1,y],[x+1,y],[x,y-1],[x,y+1]].some(([nx,ny]) => nx>=0 && nx<p.width && ny>=0 && ny<p.height && original[(ny*p.width+nx)*4+3])) px.splice(i, 4, ...color);
      } return;
    }
    if (c.op === 'selection.clear') {
      for (let y = r.y; y < r.y+r.height; y++) for (let x = r.x; x < r.x+r.width; x++) px.fill(0, (y*p.width+x)*4, (y*p.width+x)*4+4); return;
    }
    if (c.op === 'palette.reduce') { p.frames[0].cels[p.activeLayerId] = quantize(px, p.width, p.height, c.count, c.region); return; }
    if (c.op === 'paint.stroke' || c.op === 'erase.stroke') {
      if (!Array.isArray(c.points) || !c.points.length || c.points.length > 65536) throw Error('筆畫座標無效');
      const color = c.op === 'erase.stroke' ? [0, 0, 0, 0] : parseColor(c.color);
      for (const point of c.points) {
        const x = integer(point.x, 0, p.width - 1, 'X'), y = integer(point.y, 0, p.height - 1, 'Y');
        if (inRegion(x, y, r)) px.splice((y * p.width + x) * 4, 4, ...color);
      }
      return;
    }
    if (c.op === 'fill') {
      const x = integer(c.x, 0, p.width - 1, 'X'), y = integer(c.y, 0, p.height - 1, 'Y');
      const color = parseColor(c.color); if (!inRegion(x, y, r)) return;
      const old = px.slice((y * p.width + x) * 4, (y * p.width + x) * 4 + 4);
      if (old.every((v, i) => v === color[i])) return;
      const queue = [[x, y]], seen = new Uint8Array(p.width * p.height);
      while (queue.length) {
        const [cx, cy] = queue.pop();
        if (!inRegion(cx, cy, r)) continue;
        const pos = cy * p.width + cx, i = pos * 4;
        if (seen[pos]) continue; seen[pos] = 1;
        if (!old.every((v, k) => px[i + k] === v)) continue;
        px.splice(i, 4, ...color); queue.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
      }
      return;
    }
    throw Error(`未知指令：${c.op}`);
  }
}
