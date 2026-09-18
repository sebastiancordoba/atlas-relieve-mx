// Vista de proyeccion: toma las teselas Web Mercator que ya usa el mapa y las
// vuelve a proyectar pixel a pixel. Es solo para mirar y comparar; el analisis
// del relieve sigue haciendose en Mercator, que es conforme.

import { lonToX, latToY, xToLon, yToLat, TILE } from './dem.js';
import { analysisTileRGBA } from './analysis.js';
import { PROYECCIONES, AMBITOS, circuloGeodesico } from './projections.js';

const LAT_MAX = 85.0511;
const clampLat = v => Math.max(-LAT_MAX, Math.min(LAT_MAX, v));

function lienzo(w, h){
  if (typeof OffscreenCanvas !== 'undefined'){
    const c = new OffscreenCanvas(w, h);
    return { c, ctx:c.getContext('2d', { willReadFrequently:true }) };
  }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, ctx:c.getContext('2d', { willReadFrequently:true }) };
}

/**
 * Arma un mosaico en Mercator que cubre `bounds` y devuelve un muestreador por lon/lat.
 * fuente: { tiles:[url] , maxzoom } o { analisis:'slope', maxzoom }
 */
export async function mosaico({ bounds, fuente, presupuesto = 80, onProgreso }){
  const [w, s, e, n] = bounds;
  const techo = Math.min(fuente.maxzoom ?? 15, 15);

  let z = 0, r = null;
  for (let cand = 0; cand <= techo; cand++){
    const x0 = Math.floor(lonToX(w, cand)), x1 = Math.ceil(lonToX(e, cand));
    const y0 = Math.floor(latToY(clampLat(n), cand)), y1 = Math.ceil(latToY(clampLat(s), cand));
    const cuenta = Math.max(1, x1-x0) * Math.max(1, y1-y0);
    if (cuenta > presupuesto && cand > 0) break;
    z = cand; r = { x0, x1:Math.max(x1, x0+1), y0, y1:Math.max(y1, y0+1) };
  }

  const nx = r.x1 - r.x0, ny = r.y1 - r.y0;
  const { c, ctx } = lienzo(nx*TILE, ny*TILE);
  const total = nx*ny;
  let hechas = 0;
  onProgreso?.(0, total);

  // Cola con concurrencia real: si se lanzan todas a la vez, el navegador las
  // serializa de 6 en 6 por host y la espera se dispara.
  const cola = [];
  for (let ty = r.y0; ty < r.y1; ty++)
    for (let tx = r.x0; tx < r.x1; tx++) cola.push([tx, ty]);

  const simultaneas = fuente.analisis ? 4 : 8;
  let siguiente = 0;
  const trabajador = async () => {
    while (siguiente < cola.length){
      const [tx, ty] = cola[siguiente++];
      const px = (tx - r.x0)*TILE, py = (ty - r.y0)*TILE;
      try {
        if (fuente.analisis){
          const rgba = await analysisTileRGBA(fuente.analisis, z, tx, ty);
          if (rgba) ctx.putImageData(new ImageData(rgba, TILE, TILE), px, py);
        } else {
          const url = fuente.tiles[0]
            .replace('{z}', z).replace('{x}', ((tx % (1<<z)) + (1<<z)) % (1<<z)).replace('{y}', ty);
          const res = await fetch(url);
          if (res.ok){
            const bmp = await createImageBitmap(await res.blob());
            ctx.drawImage(bmp, px, py, TILE, TILE);
            bmp.close?.();
          }
        }
      } catch {}
      try { onProgreso?.(++hechas, total); } catch {}
    }
  };
  await Promise.all(Array.from({ length: Math.min(simultaneas, cola.length) }, trabajador));

  const datos = ctx.getImageData(0, 0, nx*TILE, ny*TILE).data;
  const W = nx*TILE, H = ny*TILE;
  const ox = r.x0*TILE, oy = r.y0*TILE;

  return {
    z, W, H, teselas: total,
    metros: 156543.03392804097 / Math.pow(2, z),
    /** Muestreo bilineal por coordenadas geograficas. */
    sample(lon, lat){
      const gx = lonToX(lon, z)*TILE - ox - 0.5;
      const gy = latToY(clampLat(lat), z)*TILE - oy - 0.5;
      if (gx < -1 || gy < -1 || gx > W || gy > H) return null;
      const x0 = Math.floor(gx), y0 = Math.floor(gy);
      const fx = gx - x0, fy = gy - y0;
      const at = (x, y) => {
        x = Math.max(0, Math.min(W-1, x)); y = Math.max(0, Math.min(H-1, y));
        return (y*W + x)*4;
      };
      const a = at(x0,y0), b = at(x0+1,y0), c2 = at(x0,y0+1), d = at(x0+1,y0+1);
      const mix = k =>
        (datos[a+k]*(1-fx) + datos[b+k]*fx)*(1-fy) + (datos[c2+k]*(1-fx) + datos[d+k]*fx)*fy;
      return [mix(0), mix(1), mix(2), mix(3)];
    },
  };
}

/** Caja del mapa proyectado, recorriendo el contorno del ambito. */
function cajaProyectada(proj, [w, s, e, n]){
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const ver = (lon, lat) => {
    const p = proj.forward(lon, lat);
    if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return;
    x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]);
    y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
  };
  const paso = 60;
  for (let i = 0; i <= paso; i++){
    const lon = w + (e-w)*i/paso, lat = s + (n-s)*i/paso;
    ver(lon, s); ver(lon, n); ver(w, lat); ver(e, lat);
    for (let j = 0; j <= paso; j += 10) ver(w + (e-w)*j/paso, lat);   // interior, por las conicas
  }
  return [x0, y0, x1, y1];
}

/**
 * Dibuja la vista reproyectada.
 * opciones: { proyeccion, ambito|bounds, fuente, ancho, reticula, tissot, fondo }
 */
export async function render(opciones){
  const P = PROYECCIONES.find(p => p.id === opciones.proyeccion) || PROYECCIONES[0];
  const bounds = opciones.bounds || AMBITOS[opciones.ambito].bounds;
  const proj = P.proj;

  const mo = await mosaico({ bounds, fuente:opciones.fuente,
    presupuesto:opciones.presupuesto ?? 80, onProgreso:opciones.onProgreso });

  const [bx0, by0, bx1, by1] = cajaProyectada(proj, bounds);
  const ancho = opciones.ancho || 1200;
  const escala = ancho / (bx1 - bx0);
  const alto = Math.max(1, Math.round((by1 - by0) * escala));

  const { c, ctx } = lienzo(ancho, alto);
  const img = ctx.createImageData(ancho, alto);
  const d = img.data;
  const [w, s, e, n] = bounds;
  const margen = 1e-6;

  for (let py = 0; py < alto; py++){
    const yp = by1 - (py + 0.5)/escala;                 // el eje y del mapa va hacia arriba
    for (let px = 0; px < ancho; px++){
      const xp = bx0 + (px + 0.5)/escala;
      const o = (py*ancho + px)*4;
      const geo = proj.inverse(xp, yp);
      if (!geo) continue;
      const [lon, lat] = geo;
      if (lon < w - margen || lon > e + margen || lat < s - margen || lat > n + margen) continue;
      const c4 = mo.sample(lon, lat);
      if (!c4 || c4[3] < 8) continue;
      d[o] = c4[0]; d[o+1] = c4[1]; d[o+2] = c4[2]; d[o+3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const aPx = (lon, lat) => {
    const p = proj.forward(lon, lat);
    if (!p) return null;
    return [ (p[0] - bx0)*escala, (by1 - p[1])*escala ];
  };

  if (opciones.reticula) dibujarReticula(ctx, aPx, bounds);
  if (opciones.tissot) dibujarTissot(ctx, aPx, bounds);

  return { canvas:c, ancho, alto, mosaico:mo, proyeccion:P, aPx, bounds };
}

function dibujarReticula(ctx, aPx, [w, s, e, n]){
  const span = Math.max(e-w, n-s);
  const paso = span > 120 ? 20 : span > 60 ? 15 : span > 25 ? 5 : 2;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  const linea = pts => {
    ctx.beginPath();
    let mov = true;
    for (const [lon, lat] of pts){
      const p = aPx(lon, lat);
      if (!p){ mov = true; continue; }
      mov ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]);
      mov = false;
    }
    ctx.stroke();
  };
  for (let lon = Math.ceil(w/paso)*paso; lon <= e; lon += paso){
    const pts = [];
    for (let lat = s; lat <= n; lat += 0.5) pts.push([lon, lat]);
    linea(pts);
  }
  for (let lat = Math.ceil(s/paso)*paso; lat <= n; lat += paso){
    const pts = [];
    for (let lon = w; lon <= e; lon += 0.5) pts.push([lon, lat]);
    linea(pts);
  }
  ctx.restore();
}

function dibujarTissot(ctx, aPx, [w, s, e, n]){
  const span = Math.max(e-w, n-s);
  const paso = span > 120 ? 30 : span > 60 ? 20 : span > 25 ? 8 : 4;
  const radio = span > 60 ? 500e3 : 250e3;
  ctx.save();
  ctx.lineWidth = 1.4;
  for (let lat = Math.ceil(s/paso)*paso; lat <= n - paso/4; lat += paso){
    for (let lon = Math.ceil(w/paso)*paso; lon <= e - paso/4; lon += paso){
      const aros = circuloGeodesico(lon, lat, radio, 48).map(([a, b]) => aPx(a, b));
      if (aros.some(p => !p)) continue;
      ctx.beginPath();
      aros.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
      ctx.closePath();
      ctx.fillStyle = 'rgba(240,166,60,0.30)';
      ctx.strokeStyle = 'rgba(255,214,150,0.85)';
      ctx.fill(); ctx.stroke();
    }
  }
  ctx.restore();
}
