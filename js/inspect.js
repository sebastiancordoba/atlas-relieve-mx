// Panel de inspeccion puntual: morfometria del DEM + normales climaticas.

import { elevationAt, window3x3, hornAt, metersPerPixel, getDemSource } from './dem.js';
import { fetchNormals, climographSVG, tablaMensual, ajustePorAltitud } from './climate.js';
import { fmt, dms, el } from './ui.js';

const RUMBOS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO'];
export const rumbo = d => RUMBOS[Math.round(((d%360)+360)%360 / 22.5) % 16];

function compassSVG(deg){
  const r = 15, cx = 18, cy = 18;
  const a = (deg - 90) * Math.PI/180;
  return `<svg width="36" height="36" viewBox="0 0 36 36">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#243040"/>
    <text x="${cx}" y="6.5" text-anchor="middle" font-size="7" fill="#5d6a7c" font-family="monospace">N</text>
    <line x1="${cx}" y1="${cy}" x2="${(cx+Math.cos(a)*r*0.86).toFixed(1)}" y2="${(cy+Math.sin(a)*r*0.86).toFixed(1)}"
      stroke="#f0a63c" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="2" fill="#f0a63c"/></svg>`;
}

function claseRelieve(tri){
  if (tri < 4) return 'llanura';
  if (tri < 12) return 'lomerio suave';
  if (tri < 30) return 'lomerio';
  if (tri < 70) return 'montaña moderada';
  if (tri < 140) return 'montaña abrupta';
  return 'escarpe extremo';
}

export async function inspect(host, lat, lon, opts){
  const z = Math.min(opts.analysisZoom, getDemSource().maxzoom);
  host.innerHTML = '<div class="loading"><span class="spin"></span>Leyendo el modelo de elevacion…</div>';

  const radio = Math.max(8, Math.min(34, Math.round(750 / metersPerPixel(lat, z))));
  const [elev, w3, wBig] = await Promise.all([
    elevationAt(lat, lon, z),
    window3x3(lat, lon, z, 1),
    window3x3(lat, lon, z, radio),
  ]);
  const h = hornAt(w3);
  const cell = metersPerPixel(lat, z);

  // Rugosidad TRI y relieve local en la ventana grande.
  const v = wBig.values, s = wBig.size, m = (s-1)/2, c0 = v[m*s+m];
  let tri = 0;
  for (const d of [-s-1,-s,-s+1,-1,1,s-1,s,s+1]) tri += (v[(m*s+m)+d]-c0)**2;
  tri = Math.sqrt(tri);
  let vmin = Infinity, vmax = -Infinity, sum = 0, n = 0;
  for (const x of v){ if (Number.isFinite(x)){ vmin = Math.min(vmin,x); vmax = Math.max(vmax,x); sum += x; n++; } }
  const media = sum/n;
  const tpi = c0 - media;
  const radioKm = (m*cell/1000);

  const pct = Math.tan(h.slopeDeg*Math.PI/180)*100;
  const asp = h.aspectDeg;

  host.innerHTML = `
    <dl class="kv">
      <dt>Altitud</dt><dd class="big">${fmt(elev,0)} m</dd>
      <dt>Latitud</dt><dd>${lat.toFixed(5)}</dd>
      <dt>Longitud</dt><dd>${lon.toFixed(5)}</dd>
      <dt>Coordenadas</dt><dd style="font-size:10.5px">${dms(lat,'N','S')} ${dms(lon,'E','O')}</dd>
    </dl>

    <div class="block-title">Morfometria</div>
    <dl class="kv">
      <dt>Pendiente</dt><dd>${fmt(h.slopeDeg,1)}° · ${fmt(pct,1)} %</dd>
      <dt>Orientacion</dt><dd>${Number.isFinite(asp) ? `${rumbo(asp)} ${fmt(asp,0)}°` : 'plano'}</dd>
      <dt>Rugosidad TRI</dt><dd>${fmt(tri,1)} m</dd>
      <dt>Posicion</dt><dd>${tpi > 3 ? 'cresta' : tpi < -3 ? 'valle' : 'ladera'} ${tpi>0?'+':''}${fmt(tpi,0)} m</dd>
      <dt>Relieve en ${fmt(radioKm,1)} km</dt><dd>${fmt(vmax-vmin,0)} m</dd>
      <dt>Rango local</dt><dd>${fmt(vmin,0)} – ${fmt(vmax,0)} m</dd>
    </dl>
    <div class="compass" style="margin-top:9px">
      ${Number.isFinite(asp) ? compassSVG(asp) : ''}
      <div style="font-size:11px;color:var(--muted);line-height:1.4">
        Terreno de <b style="color:var(--text)">${claseRelieve(tri)}</b>.<br>
        Celda de analisis: ${fmt(cell,0)} m (zoom ${z}).
      </div>
    </div>

    <div class="block-title">Clima</div>
    <div id="clima-slot"></div>`;

  const slot = host.querySelector('#clima-slot');
  const btn = el('button','btn');
  btn.innerHTML = 'Cargar normales 1991–2020';
  btn.onclick = () => cargarClima(slot, lat, lon, elev);
  slot.appendChild(btn);
  if (opts.autoClima) cargarClima(slot, lat, lon, elev);

  return { elev, slopeDeg:h.slopeDeg, aspectDeg:asp, tri, tpi, relieve:vmax-vmin };
}

async function cargarClima(slot, lat, lon, elevDEM){
  slot.innerHTML = '<div class="loading"><span class="spin"></span>Descargando 30 años de ERA5…</div>';
  try{
    const n = await fetchNormals(lat, lon);
    const aj = ajustePorAltitud(n, elevDEM);
    const est = aj && Math.abs(aj.dz) > 120
      ? `<div class="note" style="margin-top:9px">La celda ERA5 esta a ${fmt(n.elevERA5,0)} m y el punto a ${fmt(elevDEM,0)} m
         (${aj.dz>0?'+':''}${fmt(aj.dz,0)} m). Con gradiente de 6.5 °C/km la media local seria
         <b>${fmt(aj.Tajustada,1)} °C</b> en vez de ${fmt(n.MAT,1)} °C.</div>`
      : '';
    slot.innerHTML = `
      <div class="koppen">
        <span class="code">${n.koppen.code}</span>
        <span class="desc">${n.koppen.desc}</span>
      </div>
      <dl class="kv" style="margin-top:9px">
        <dt>Temp. media anual</dt><dd>${fmt(n.MAT,1)} °C</dd>
        <dt>Lluvia anual</dt><dd>${fmt(n.MAP,0)} mm</dd>
        <dt>Oscilacion anual</dt><dd>${fmt(n.amplitud,1)} °C</dd>
        <dt>Mes mas humedo</dt><dd>${MESES[n.mesHumedo]} · ${fmt(n.P[n.mesHumedo],0)} mm</dd>
        <dt>Mes mas seco</dt><dd>${MESES[n.mesSeco]} · ${fmt(n.P[n.mesSeco],0)} mm</dd>
      </dl>
      ${climographSVG(n)}
      ${tablaMensual(n)}
      ${est}
      <div class="sub" style="font-size:10px;color:var(--dim);margin-top:7px">
        ERA5 reanalisis (~9–25 km) via Open-Meteo · ${n.years} años.</div>`;
  }catch(e){
    const limite = /429/.test(e.message);
    slot.innerHTML = `<div class="note">${limite
      ? 'Open-Meteo limito las peticiones por minuto. Espera unos segundos y vuelve a intentar.'
      : 'No se pudo obtener el clima: ' + e.message}</div>`;
    const b = el('button','btn'); b.textContent = 'Reintentar'; b.style.marginTop = '8px';
    b.onclick = () => cargarClima(slot, lat, lon, elevDEM);
    slot.appendChild(b);
  }
}

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
