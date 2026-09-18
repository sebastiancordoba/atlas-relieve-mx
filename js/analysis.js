// Protocolo "analysis://" para MapLibre: genera teselas de pendiente, orientacion,
// altitud, rugosidad, posicion topografica y curvas de nivel en el navegador.

import { paddedGrid, metersPerPixel, yToLat, TILE } from './dem.js';

const PAD = 8;
const GRID = TILE + 2*PAD;

const pool = [];
const pending = new Map();
let seq = 0;
let version = 1;
let options = { interval:100, indexEvery:5, tpiRadius:8, flatBelow:1.2 };

function spawnPool(){
  const n = Math.max(2, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
  for (let i=0; i<n; i++){
    const w = new Worker(new URL('./analysis-worker.js', import.meta.url), { type:'module' });
    w.onmessage = (ev) => {
      const job = pending.get(ev.data.id);
      if (!job) return;
      pending.delete(ev.data.id);
      w.busy--;
      ev.data.error ? job.reject(new Error(ev.data.error)) : job.resolve(ev.data.rgba);
    };
    w.busy = 0;
    pool.push(w);
  }
}

function runWorker(msg, transfer){
  if (!pool.length) spawnPool();
  const w = pool.reduce((a,b) => (a.busy <= b.busy ? a : b));
  w.busy++;
  const id = ++seq;
  return new Promise((resolve,reject) => {
    pending.set(id, {resolve,reject});
    w.postMessage({ ...msg, id }, transfer);
  });
}

let encoder = null;
function getEncoder(){
  if (encoder) return encoder;
  if (typeof OffscreenCanvas !== 'undefined'){
    const c = new OffscreenCanvas(TILE,TILE);
    encoder = { c, ctx:c.getContext('2d'), off:true };
  } else {
    const c = document.createElement('canvas');
    c.width = c.height = TILE;
    encoder = { c, ctx:c.getContext('2d'), off:false };
  }
  return encoder;
}

async function toPng(rgba){
  const e = getEncoder();
  e.ctx.putImageData(new ImageData(rgba, TILE, TILE), 0, 0);
  const blob = e.off
    ? await e.c.convertToBlob({ type:'image/png' })
    : await new Promise(res => e.c.toBlob(res, 'image/png'));
  return await blob.arrayBuffer();
}

const EMPTY = (() => {
  // PNG 1x1 totalmente transparente.
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) arr[i] = bin.charCodeAt(i);
  return arr.buffer;
})();

export function setAnalysisOptions(partial){
  options = { ...options, ...partial };
  version++;
  return version;
}
export function analysisVersion(){ return version; }
export function analysisTiles(kind){
  return [`analysis://${kind}/{z}/{x}/{y}?v=${version}`];
}

export function registerAnalysisProtocol(){
  maplibregl.addProtocol('analysis', async (params, abortController) => {
    const m = /^analysis:\/\/([a-z]+)\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
    if (!m) return { data: EMPTY };
    const kind = m[1], z = +m[2], x = +m[3], y = +m[4];

    const grid = await paddedGrid(z, x, y, PAD);
    if (!grid || abortController?.signal?.aborted) return { data: EMPTY };

    const lat = yToLat(y + 0.5, z);
    const cell = metersPerPixel(lat, z);
    const rgba = await runWorker(
      { kind, grid, S:GRID, pad:PAD, cell, opts:options },
      [grid.buffer]
    );
    return { data: await toPng(rgba) };
  });
}
