// Lectura de teselas DEM (terrarium / terrain-RGB) con cache LRU compartida.
// Toda la app -inspector, perfiles y capas derivadas- lee la elevacion de aqui.

import { DEM_SOURCES } from './config.js';

export const TILE = 256;
const MAX_TILES = 260;              // ~68 MB en Float32
const cache = new Map();            // "z/x/y" -> Promise<Float32Array|null>

let src = { ...DEM_SOURCES.terrarium };

export function getDemSource(){ return src; }

export function setDemSource(partial){
  src = { ...src, ...partial };
  cache.clear();
  return src;
}

function decodePixel(r,g,b){
  if (src.encoding === 'mapbox') return -10000 + ((r*65536 + g*256 + b) * 0.1);
  return (r*256 + g + b/256) - 32768;   // terrarium
}

function tileUrl(z,x,y){
  return src.url.replace('{z}',z).replace('{x}',x).replace('{y}',y);
}

function canvas2d(w,h){
  if (typeof OffscreenCanvas !== 'undefined') {
    const c = new OffscreenCanvas(w,h);
    return { c, ctx:c.getContext('2d',{willReadFrequently:true}) };
  }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, ctx:c.getContext('2d',{willReadFrequently:true}) };
}

function touch(key, value){
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > MAX_TILES) cache.delete(cache.keys().next().value);
}

/** Devuelve Float32Array(256*256) con metros sobre el nivel del mar, o null si no hay dato. */
export function demTile(z,x,y){
  const n = 1 << z;
  if (y < 0 || y >= n) return Promise.resolve(null);
  x = ((x % n) + n) % n;
  const key = `${z}/${x}/${y}`;
  const hit = cache.get(key);
  if (hit) { touch(key, hit); return hit; }

  const p = (async () => {
    const res = await fetch(tileUrl(z,x,y));
    if (!res.ok) return null;
    const bmp = await createImageBitmap(await res.blob());
    const { ctx } = canvas2d(TILE,TILE);
    ctx.drawImage(bmp, 0, 0, TILE, TILE);
    bmp.close?.();
    const d = ctx.getImageData(0,0,TILE,TILE).data;
    const out = new Float32Array(TILE*TILE);
    for (let i=0, j=0; i<out.length; i++, j+=4) out[i] = decodePixel(d[j],d[j+1],d[j+2]);
    return out;
  })().catch(() => null);

  touch(key, p);
  return p;
}

/** Malla (256+2*pad)^2 tomando el borde de las teselas vecinas: sin costuras entre teselas. */
export async function paddedGrid(z,x,y,pad=8){
  const S = TILE + 2*pad;
  const grid = new Float32Array(S*S);
  const jobs = [];
  for (let dy=-1; dy<=1; dy++)
    for (let dx=-1; dx<=1; dx++)
      jobs.push(demTile(z, x+dx, y+dy).then(t => ({dx,dy,t})));
  const tiles = await Promise.all(jobs);
  const center = tiles.find(t => t.dx===0 && t.dy===0).t;
  if (!center) return null;

  const clamp = (v,lo,hi) => v<lo?lo:(v>hi?hi:v);
  for (const {dx,dy,t} of tiles){
    const offX = dx*TILE + pad, offY = dy*TILE + pad;
    const tx0 = Math.max(0, -offX), tx1 = Math.min(TILE, S-offX);
    const ty0 = Math.max(0, -offY), ty1 = Math.min(TILE, S-offY);
    for (let ty=ty0; ty<ty1; ty++){
      const gRow = (offY+ty)*S;
      const sRow = t ? ty*TILE : clamp(dy*TILE+ty,0,TILE-1)*TILE;
      for (let tx=tx0; tx<tx1; tx++){
        grid[gRow + offX + tx] = t ? t[sRow+tx] : center[sRow + clamp(dx*TILE+tx,0,TILE-1)];
      }
    }
  }
  return grid;
}

// ---------- conversiones ----------
export function lonToX(lon,z){ return (lon+180)/360 * (1<<z); }
export function latToY(lat,z){
  const r = lat * Math.PI/180;
  return (1 - Math.log(Math.tan(r) + 1/Math.cos(r))/Math.PI)/2 * (1<<z);
}
export function xToLon(x,z){ return x/(1<<z)*360 - 180; }
export function yToLat(y,z){
  const n = Math.PI - 2*Math.PI*y/(1<<z);
  return 180/Math.PI * Math.atan(0.5*(Math.exp(n)-Math.exp(-n)));
}

/** Tamaño de pixel en metros sobre el terreno para un zoom y latitud dados. */
export function metersPerPixel(lat, z, tileSize=TILE){
  return 156543.03392804097 * Math.cos(lat*Math.PI/180) / Math.pow(2,z) * (256/tileSize);
}

async function pixelValue(z, gx, gy){
  const n = (1<<z) * TILE;
  gy = Math.min(n-1, Math.max(0, gy));
  const tx = Math.floor(gx/TILE), ty = Math.floor(gy/TILE);
  const t = await demTile(z, tx, ty);
  if (!t) return NaN;
  const px = gx - tx*TILE, py = gy - ty*TILE;
  return t[py*TILE + ((px%TILE)+TILE)%TILE];
}

/** Elevacion interpolada bilinealmente en un punto geografico. */
export async function elevationAt(lat, lon, z=14){
  z = Math.min(z, src.maxzoom);
  const fx = lonToX(lon,z)*TILE - 0.5, fy = latToY(lat,z)*TILE - 0.5;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  const [a,b,c,d] = await Promise.all([
    pixelValue(z,x0,y0), pixelValue(z,x0+1,y0), pixelValue(z,x0,y0+1), pixelValue(z,x0+1,y0+1),
  ]);
  if ([a,b,c,d].some(Number.isNaN)) return NaN;
  return (a*(1-tx) + b*tx)*(1-ty) + (c*(1-tx) + d*tx)*ty;
}

/** Ventana cuadrada de elevaciones alrededor de un punto (para pendiente puntual y relieve local). */
export async function window3x3(lat, lon, z, radius=1){
  z = Math.min(z, src.maxzoom);
  const gx = Math.floor(lonToX(lon,z)*TILE), gy = Math.floor(latToY(lat,z)*TILE);
  const size = radius*2+1;
  const jobs = [];
  for (let dy=-radius; dy<=radius; dy++)
    for (let dx=-radius; dx<=radius; dx++)
      jobs.push(pixelValue(z, gx+dx, gy+dy));
  const vals = await Promise.all(jobs);
  return { values:new Float32Array(vals), size, cell:metersPerPixel(lat,z) };
}

/** Pendiente y orientacion puntuales por el metodo de Horn. */
export function hornAt(w){
  const v = w.values, s = w.size, c = w.cell, m = (s-1)/2;
  const g = (dx,dy) => v[(m+dy)*s + (m+dx)];
  const a=g(-1,-1), b=g(0,-1), cc=g(1,-1), d=g(-1,0), f=g(1,0), gg=g(-1,1), h=g(0,1), i=g(1,1);
  const dzdx = ((cc + 2*f + i) - (a + 2*d + gg)) / (8*c);
  const dzdy = ((gg + 2*h + i) - (a + 2*b + cc)) / (8*c);
  const slopeDeg = Math.atan(Math.hypot(dzdx,dzdy)) * 180/Math.PI;
  let asp = Math.atan2(dzdy, -dzdx) * 180/Math.PI;
  if (asp < 0) asp = 90 - asp; else if (asp > 90) asp = 360 - asp + 90; else asp = 90 - asp;
  return { slopeDeg, aspectDeg: slopeDeg < 0.15 ? NaN : asp, dzdx, dzdy };
}

export function cacheStats(){ return { tiles:cache.size, max:MAX_TILES }; }
