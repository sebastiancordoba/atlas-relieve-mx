// Herramienta de perfil topografico: traza una linea y muestrea el DEM.

import { elevationAt } from './dem.js';
import { rampLookup, SLOPE } from './ramps.js';
import { fmt } from './ui.js';

const R = 6371008.8;
const rad = d => d*Math.PI/180;

export function haversine(a, b){
  const dLat = rad(b[1]-a[1]), dLon = rad(b[0]-a[0]);
  const s = Math.sin(dLat/2)**2 + Math.cos(rad(a[1]))*Math.cos(rad(b[1]))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(s));
}

export function densify(pts, n){
  const segs = [];
  let total = 0;
  for (let i=1;i<pts.length;i++){ const d = haversine(pts[i-1],pts[i]); segs.push(d); total += d; }
  const out = [];
  for (let i=0;i<n;i++){
    let t = total * i/(n-1);
    let k = 0;
    while (k < segs.length-1 && t > segs[k]){ t -= segs[k]; k++; }
    const f = segs[k] ? t/segs[k] : 0;
    out.push([
      pts[k][0] + (pts[k+1][0]-pts[k][0])*f,
      pts[k][1] + (pts[k+1][1]-pts[k][1])*f,
      total * i/(n-1),
    ]);
  }
  return { samples: out, total };
}

export async function sampleProfile(pts, z, n=320){
  const { samples, total } = densify(pts, n);
  const elevs = [];
  const lote = 48;                       // limita las peticiones simultaneas de teselas
  for (let i=0;i<samples.length;i+=lote){
    const parte = await Promise.all(samples.slice(i,i+lote).map(s => elevationAt(s[1], s[0], z)));
    elevs.push(...parte);
  }
  const out = samples.map((s,i) => ({ lon:s[0], lat:s[1], d:s[2], h:elevs[i] }));
  return { pts: out.filter(p => Number.isFinite(p.h)), total };
}

/** Media movil sobre la altura: quita el ruido del DEM antes de acumular desniveles. */
export function suavizar(pts, k=5){
  const h = pts.map(p => p.h);
  const r = Math.floor(k/2);
  return pts.map((p,i) => {
    let s = 0, n = 0;
    for (let j=Math.max(0,i-r); j<=Math.min(h.length-1,i+r); j++){ s += h[j]; n++; }
    return { ...p, h:p.h, hs:s/n };
  });
}

export function stats(pts){
  const hs = pts.map(p => p.h).filter(Number.isFinite);
  if (!hs.length) return null;
  let asc = 0, desc = 0, maxSlope = 0, sumaPend = 0, tramos = 0;
  const VENTANA = 120;                     // m: paso minimo para medir desnivel
  const alt = p => (p.hs ?? p.h);          // usa la serie suavizada si existe
  let refH = alt(pts[0]), refD = pts[0].d;
  for (let i=1;i<pts.length;i++){
    const dd = pts[i].d - refD;
    if (dd >= VENTANA){
      const dh = alt(pts[i]) - refH;
      if (dh > 0) asc += dh; else desc -= dh;
      const pend = Math.abs(Math.atan(dh/dd)*180/Math.PI);
      maxSlope = Math.max(maxSlope, pend);
      sumaPend += pend; tramos++;
      refH = alt(pts[i]); refD = pts[i].d;
    }
  }
  const total = pts[pts.length-1].d;
  const neta = alt(pts[pts.length-1]) - alt(pts[0]);
  return {
    min:Math.min(...hs), max:Math.max(...hs), total, asc, desc, neta, maxSlope,
    media: tramos ? sumaPend/tramos : 0,
    netaPend: Math.abs(Math.atan(neta/total)*180/Math.PI),
  };
}

export function profileSVG(pts, st, w=1000, h=170){
  const padL = 44, padR = 12, padT = 10, padB = 26;
  const iw = w-padL-padR, ih = h-padT-padB;
  const hMin = Math.floor(st.min/100)*100, hMax = Math.ceil(st.max/100)*100 || st.max+10;
  const span = Math.max(1, hMax-hMin);
  const X = d => padL + d/st.total*iw;
  const Y = v => padT + ih - (v-hMin)/span*ih;

  let path = '', area = '';
  pts.forEach((p,i) => {
    if (!Number.isFinite(p.h)) return;
    path += `${i ? 'L' : 'M'}${X(p.d).toFixed(1)},${Y(p.h).toFixed(1)} `;
  });
  area = path + `L${X(st.total).toFixed(1)},${padT+ih} L${padL},${padT+ih} Z`;

  let grid = '';
  const steps = 4;
  for (let i=0;i<=steps;i++){
    const v = hMin + span*i/steps, y = Y(v);
    grid += `<line class="grid" x1="${padL}" y1="${y.toFixed(1)}" x2="${w-padR}" y2="${y.toFixed(1)}"/>`
          + `<text x="${padL-6}" y="${(y+3).toFixed(1)}" text-anchor="end">${Math.round(v)}</text>`;
  }
  const kmStep = st.total > 60000 ? 20000 : st.total > 20000 ? 5000 : st.total > 6000 ? 2000 : 500;
  for (let d=0; d<=st.total; d+=kmStep){
    grid += `<line class="grid" x1="${X(d).toFixed(1)}" y1="${padT}" x2="${X(d).toFixed(1)}" y2="${padT+ih}" opacity=".5"/>`
          + `<text x="${X(d).toFixed(1)}" y="${h-12}" text-anchor="middle">${d>=1000 ? (d/1000)+' km' : d+' m'}</text>`;
  }

  // Franja de pendiente bajo el perfil.
  let strip = '';
  const paso = Math.max(1, Math.round(120 / Math.max(1, st.total/pts.length)));
  for (let i=paso;i<pts.length;i+=paso){
    const dd = pts[i].d - pts[i-paso].d;
    if (!dd) continue;
    const a0 = pts[i-paso].hs ?? pts[i-paso].h, a1 = pts[i].hs ?? pts[i].h;
    const sl = Math.abs(Math.atan((a1-a0)/dd)*180/Math.PI);
    const c = rampLookup(SLOPE, sl).map(Math.round);
    strip += `<rect x="${X(pts[i-paso].d).toFixed(1)}" y="${(h-9).toFixed(1)}" width="${(X(pts[i].d)-X(pts[i-paso].d)+0.6).toFixed(1)}"
      height="5" fill="rgb(${c})"/>`;
  }

  return `<svg class="prof-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f0a63c" stop-opacity=".45"/>
      <stop offset="1" stop-color="#f0a63c" stop-opacity=".02"/></linearGradient></defs>
    ${grid}
    <path d="${area}" fill="url(#pg)"/>
    <path d="${path}" fill="none" stroke="#f0a63c" stroke-width="1.6" vector-effect="non-scaling-stroke"/>
    ${strip}
    <line id="prof-cursor" x1="0" y1="${padT}" x2="0" y2="${padT+ih}" stroke="#45c2a4" stroke-width="1"
      vector-effect="non-scaling-stroke" opacity="0"/>
  </svg>`;
}

export function statsHTML(st){
  return `<div class="prof-stats">
    <div><b>${fmt(st.total/1000,2)} km</b>distancia</div>
    <div><b>${fmt(st.min,0)} – ${fmt(st.max,0)} m</b>rango de altitud</div>
    <div><b>${fmt(st.max-st.min,0)} m</b>desnivel</div>
    <div><b>+${fmt(st.asc,0)} / −${fmt(st.desc,0)} m</b>acumulado</div>
    <div><b>${fmt(st.media,1)}°</b>pendiente media</div>
    <div><b>${fmt(st.maxSlope,1)}°</b>pendiente maxima</div>
    <div><b>${st.neta>=0?'+':'−'}${fmt(Math.abs(st.neta),0)} m</b>desnivel neto</div>
  </div>`;
}
