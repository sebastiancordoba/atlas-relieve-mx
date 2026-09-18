// Worker de analisis morfometrico: recibe una malla de elevaciones con borde
// y devuelve la tesela RGBA ya coloreada.

import { rampLookup, aspectColor, HYPSO, SLOPE, TRI, TPI } from './ramps.js';

const TILE = 256;
const DEG = 180/Math.PI;

function idx(S, pad, px, py){ return (py+pad)*S + (px+pad); }

function horn(g, S, pad, px, py, cell){
  const i = idx(S,pad,px,py);
  const a=g[i-S-1], b=g[i-S], c=g[i-S+1];
  const d=g[i-1],              f=g[i+1];
  const h=g[i+S-1], k=g[i+S],  l=g[i+S+1];
  const dzdx = ((c + 2*f + l) - (a + 2*d + h)) / (8*cell);
  const dzdy = ((h + 2*k + l) - (a + 2*b + c)) / (8*cell);
  return [dzdx, dzdy];
}

function summedArea(g, S){
  const sat = new Float64Array((S+1)*(S+1));
  for (let y=0; y<S; y++){
    let rs = 0;
    for (let x=0; x<S; x++){
      rs += g[y*S+x];
      sat[(y+1)*(S+1) + (x+1)] = sat[y*(S+1) + (x+1)] + rs;
    }
  }
  return sat;
}

function boxMean(sat, S, x0, y0, x1, y1){
  const W = S+1;
  const s = sat[y1*W + x1] - sat[y0*W + x1] - sat[y1*W + x0] + sat[y0*W + x0];
  return s / ((x1-x0)*(y1-y0));
}

function render(kind, grid, S, pad, cell, opts){
  const out = new Uint8ClampedArray(TILE*TILE*4);
  let sat = null;
  if (kind === 'tpi') sat = summedArea(grid, S);
  const R = opts.tpiRadius ?? 8;
  const interval = opts.interval ?? 100;
  const indexEvery = opts.indexEvery ?? 5;

  for (let py=0; py<TILE; py++){
    for (let px=0; px<TILE; px++){
      const o = (py*TILE+px)*4;
      const e = grid[idx(S,pad,px,py)];
      let r=0,g=0,b=0,a=255;

      if (kind === 'hypso'){
        [r,g,b] = rampLookup(HYPSO, e);

      } else if (kind === 'slope'){
        const [dx,dy] = horn(grid,S,pad,px,py,cell);
        const deg = Math.atan(Math.hypot(dx,dy)) * DEG;
        [r,g,b] = rampLookup(SLOPE, deg);

      } else if (kind === 'aspect'){
        const [dx,dy] = horn(grid,S,pad,px,py,cell);
        const deg = Math.atan(Math.hypot(dx,dy)) * DEG;
        if (deg < (opts.flatBelow ?? 1.2)){ r=g=b=118; a=150; }
        else {
          let asp = Math.atan2(dy, -dx) * DEG;
          if (asp < 0) asp = 90 - asp; else if (asp > 90) asp = 360 - asp + 90; else asp = 90 - asp;
          [r,g,b] = aspectColor(asp);
        }

      } else if (kind === 'tri'){
        const i = idx(S,pad,px,py);
        let s = 0;
        for (const d of [-S-1,-S,-S+1,-1,1,S-1,S,S+1]){ const dv = grid[i+d]-grid[i]; s += dv*dv; }
        [r,g,b] = rampLookup(TRI, Math.sqrt(s));

      } else if (kind === 'tpi'){
        const gx = px+pad, gy = py+pad;
        const x0 = Math.max(0,gx-R), y0 = Math.max(0,gy-R);
        const x1 = Math.min(S,gx+R+1), y1 = Math.min(S,gy+R+1);
        [r,g,b] = rampLookup(TPI, e - boxMean(sat,S,x0,y0,x1,y1));

      } else if (kind === 'contours'){
        const i = idx(S,pad,px,py);
        const bandC = Math.floor(e/interval);
        const cross = bandC !== Math.floor(grid[i+1]/interval) || bandC !== Math.floor(grid[i+S]/interval);
        if (cross){
          const isIndex = (bandC % indexEvery === 0) || (Math.floor(grid[i+1]/interval) % indexEvery === 0);
          if (isIndex){ r=245; g=205; b=140; a=235; } else { r=214; g=164; b=96; a=140; }
        } else { a = 0; }
      }

      out[o]=r; out[o+1]=g; out[o+2]=b; out[o+3]=a;
    }
  }
  return out;
}

self.onmessage = (ev) => {
  const { id, kind, grid, S, pad, cell, opts } = ev.data;
  try {
    const rgba = render(kind, grid, S, pad, cell, opts || {});
    self.postMessage({ id, rgba }, [rgba.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
