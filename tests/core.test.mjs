import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine, makeProject, reconstruct, activePixels, quantize, paletteOf, validateProject } from '../dist/core.js';
const source = (width, height, fn) => ({ width, height, pixels: Array.from({ length: width * height }, (_, i) => fn(i % width, Math.floor(i / width))).flat() });
const grid = { cellWidth: 2, cellHeight: 2, offsetX: 0, offsetY: 0, alphaThreshold: 128, method: 'dominant' };
const engine = () => { const e = new Engine(makeProject(source(4, 4, (x, y) => x < 2 ? [220, 20, 30, 255] : [20, 40, 220, 255]))); e.dispatch({ op: 'rebuild', grid }); return e; };
test('reconstruction returns one solid color per cell and correct native size', () => {
  const out = reconstruct(source(4, 4, x => x < 2 ? [220, 20, 30, 255] : [20, 40, 220, 255]), grid);
  assert.equal(out.width, 2); assert.equal(out.height, 2);
  assert.deepEqual(out.pixels, [220, 20, 30, 255, 20, 40, 220, 255, 220, 20, 30, 255, 20, 40, 220, 255]);
});
test('dominant bucket rejects a differently colored minority instead of averaging edges', () => {
  const s = source(2, 2, (x, y) => x === 1 && y === 1 ? [0, 0, 255, 255] : [250 + x, 1, 1, 255]);
  const out = reconstruct(s, grid); assert.equal(out.pixels[2], 1); assert.ok(out.pixels[0] >= 250);
});
test('offsets crop top/left and retain partial right/bottom cells', () => {
  const out = reconstruct(source(6, 4, (x, y) => [x, y, 0, 255]), { ...grid, offsetX: 1, offsetY: 1, method: 'center' });
  assert.equal(out.width, 3); assert.equal(out.height, 2); assert.deepEqual(out.pixels.slice(-4), [5, 3, 0, 255]);
});
test('alpha threshold and coverage produce only binary transparency', () => {
  const out = reconstruct(source(4, 2, x => x < 2 ? [100, 100, 100, 100] : [200, 0, 0, 255]), grid);
  assert.deepEqual(out.pixels, [0, 0, 0, 0, 200, 0, 0, 255]);
});
test('quantization enforces target color cap and preserves transparent pixels', () => {
  const s = source(16, 16, (x, y) => [x * 16, y * 16, (x + y) * 8, x === 0 ? 0 : 255]);
  const out = quantize(s.pixels, 16, 16, 8); assert.ok(paletteOf(out).length <= 8);
  for (let i = 0; i < out.length; i += 4) if (!s.pixels[i + 3]) assert.deepEqual(out.slice(i, i + 4), s.pixels.slice(i, i + 4));
});
test('regional reduction and paint do not touch outside selection', () => {
  const e = engine(), before = activePixels(e.project).slice();
  e.dispatch({ op: 'paint.stroke', color: '#00ff00', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }], region: { x: 0, y: 0, width: 1, height: 1 } });
  assert.deepEqual(activePixels(e.project).slice(4), before.slice(4));
  const px = source(4, 2, (x, y) => [x * 60, y * 100, 0, 255]).pixels;
  const out = quantize(px, 4, 2, 2, { x: 1, y: 0, width: 2, height: 2 });
  for (const i of [0, 12, 16, 28]) assert.deepEqual(out.slice(i, i + 4), px.slice(i, i + 4));
});
test('flood fill is contiguous, exact-color and selection-bounded', () => {
  const e = engine(); e.dispatch({ op: 'fill', x: 0, y: 0, color: '#00ff00' });
  assert.deepEqual(activePixels(e.project), [0, 255, 0, 255, 20, 40, 220, 255, 0, 255, 0, 255, 20, 40, 220, 255]);
  e.dispatch({ op: 'fill', x: 0, y: 0, color: '#ffffff', region: { x: 0, y: 0, width: 1, height: 1 } });
  assert.deepEqual(activePixels(e.project).slice(8, 12), [0, 255, 0, 255]);
});
test('undo/redo restores exact pixels and new edits invalidate redo', () => {
  const e = engine(), before = structuredClone(e.project);
  e.dispatch({ op: 'erase.stroke', points: [{ x: 0, y: 0 }] }); const after = structuredClone(e.project);
  e.dispatch({ op: 'undo' }); assert.deepEqual(e.project, before);
  e.dispatch({ op: 'redo' }); assert.deepEqual(e.project, after);
  e.dispatch({ op: 'undo' }); e.dispatch({ op: 'fill', x: 0, y: 0, color: '#ffffff' }); assert.equal(e.future.length, 0);
});
test('invalid or partially invalid commands are atomic', () => {
  const e = engine(), before = structuredClone(e.project), length = e.history.length;
  assert.throws(() => e.dispatch({ op: 'paint.stroke', color: '#ffffff', points: [{ x: 0, y: 0 }, { x: 9, y: 0 }] }));
  assert.deepEqual(e.project, before); assert.equal(e.history.length, length);
  assert.throws(() => e.dispatch({ op: 'palette.reduce', count: 1 }));
  assert.throws(() => e.dispatch({ op: 'rebuild', grid: { cellWidth: 0 } }));
  assert.deepEqual(e.project, before);
});
test('JSON roundtrip preserves original, grid, cels and metadata', () => {
  const e = engine(); e.dispatch({ op: 'fill', x: 0, y: 0, color: '#010203' });
  const json = JSON.stringify(e.project); const other = new Engine(JSON.parse(json));
  assert.deepEqual(other.project, e.project); validateProject(other.project);
});
test('incomplete layer data and malformed pixel data are rejected explicitly', () => {
  const p = engine().project; p.layers.push({ id: 'other' }); assert.throws(() => validateProject(p), /影格/);
  const q = engine().project; q.source.pixels[0] = -1; assert.throws(() => validateProject(q));
});
test('all-transparent input remains transparent through reconstruction and quantization', () => {
  const out = reconstruct(source(4, 4, () => [0, 0, 0, 0]), grid);
  assert.deepEqual(quantize(out.pixels, out.width, out.height, 8), out.pixels);
});
