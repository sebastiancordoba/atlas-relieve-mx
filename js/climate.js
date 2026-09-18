// Clima puntual: normales 1991-2020 de ERA5 via Open-Meteo, clasificacion de
// Koppen-Geiger y climograma.

const MESES = ['E','F','M','A','M','J','J','A','S','O','N','D'];
const MESES_L = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

const cache = new Map();

export async function fetchNormals(lat, lon, { from='1991-01-01', to='2020-12-31' } = {}){
  const key = `${lat.toFixed(3)},${lon.toFixed(3)},${from}`;
  if (cache.has(key)) return cache.get(key);

  const url = 'https://archive-api.open-meteo.com/v1/archive'
    + `?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`
    + `&start_date=${from}&end_date=${to}`
    + '&daily=temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum'
    + '&timezone=GMT';

  const p = (async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Open-Meteo respondio ' + res.status);
    const j = await res.json();
    return summarize(j);
  })();
  cache.set(key, p);
  return p;
}

function summarize(j){
  const d = j.daily;
  const n = d.time.length;
  const sum = Array.from({length:12}, () => ({t:0,tc:0,tx:0,txc:0,tn:0,tnc:0,p:0,pc:0}));
  const yearsSeen = new Set();
  const monthYearP = new Map();     // "YYYY-MM" -> mm acumulados

  for (let i=0;i<n;i++){
    const ts = d.time[i];
    const m = +ts.slice(5,7) - 1;
    const s = sum[m];
    yearsSeen.add(ts.slice(0,4));
    const t = d.temperature_2m_mean[i], tx = d.temperature_2m_max[i], tn = d.temperature_2m_min[i], p = d.precipitation_sum[i];
    if (t != null){ s.t += t; s.tc++; }
    if (tx != null){ s.tx += tx; s.txc++; }
    if (tn != null){ s.tn += tn; s.tnc++; }
    if (p != null){
      const k = ts.slice(0,7);
      monthYearP.set(k, (monthYearP.get(k) || 0) + p);
      s.pc++;
    }
  }
  const years = yearsSeen.size;
  const pMonth = Array(12).fill(0), pCount = Array(12).fill(0);
  for (const [k,v] of monthYearP){ const m = +k.slice(5,7)-1; pMonth[m] += v; pCount[m]++; }

  const T  = sum.map(s => s.tc ? s.t/s.tc : NaN);
  const Tx = sum.map(s => s.txc ? s.tx/s.txc : NaN);
  const Tn = sum.map(s => s.tnc ? s.tn/s.tnc : NaN);
  const P  = pMonth.map((v,i) => pCount[i] ? v/pCount[i] : NaN);

  const MAP = P.reduce((a,b)=>a+b,0);
  const MAT = T.reduce((a,b)=>a+b,0)/12;

  return {
    T, Tx, Tn, P, MAP, MAT, years,
    elevERA5: j.elevation,
    lat: j.latitude, lon: j.longitude,
    Tcold: Math.min(...T), Thot: Math.max(...T),
    amplitud: Math.max(...T) - Math.min(...T),
    mesSeco: P.indexOf(Math.min(...P)),
    mesHumedo: P.indexOf(Math.max(...P)),
    koppen: koppen(T, P, j.latitude),
  };
}

/** Clasificacion de Koppen-Geiger segun los umbrales de Peel, Finlayson & McMahon (2007). */
export function koppen(T, P, lat){
  const MAP = P.reduce((a,b)=>a+b,0);
  const MAT = T.reduce((a,b)=>a+b,0)/12;
  const Tcold = Math.min(...T), Thot = Math.max(...T);
  const Tmon10 = T.filter(t => t >= 10).length;
  const Pdry = Math.min(...P);

  const norte = lat >= 0;
  const verano = norte ? [3,4,5,6,7,8] : [9,10,11,0,1,2];
  const invierno = norte ? [9,10,11,0,1,2] : [3,4,5,6,7,8];
  const pick = idx => idx.map(i => P[i]);
  const Psdry = Math.min(...pick(verano)), Pswet = Math.max(...pick(verano));
  const Pwdry = Math.min(...pick(invierno)), Pwwet = Math.max(...pick(invierno));
  const Pver = pick(verano).reduce((a,b)=>a+b,0), Pinv = pick(invierno).reduce((a,b)=>a+b,0);

  let umbral = 2*MAT + 14;
  if (Pinv >= 0.7*MAP) umbral = 2*MAT;
  else if (Pver >= 0.7*MAP) umbral = 2*MAT + 28;
  umbral *= 10;

  let code;
  if (MAP < umbral){                                    // B - arido
    code = (MAP < umbral/2 ? 'BW' : 'BS') + (MAT >= 18 ? 'h' : 'k');
  } else if (Tcold >= 18){                              // A - tropical
    if (Pdry >= 60) code = 'Af';
    else if (Pdry >= 100 - MAP/25) code = 'Am';
    else code = verano.includes(P.indexOf(Pdry)) ? 'As' : 'Aw';
  } else if (Thot > 10 && Tcold > 0 && Tcold < 18){     // C - templado
    let s2 = 'f';
    if (Psdry < 40 && Psdry < Pwwet/3) s2 = 's';
    else if (Pwdry < Pswet/10) s2 = 'w';
    const s3 = Thot >= 22 ? 'a' : (Tmon10 >= 4 ? 'b' : 'c');
    code = 'C' + s2 + s3;
  } else if (Thot > 10 && Tcold <= 0){                  // D - continental
    let s2 = 'f';
    if (Psdry < 40 && Psdry < Pwwet/3) s2 = 's';
    else if (Pwdry < Pswet/10) s2 = 'w';
    const s3 = Thot >= 22 ? 'a' : (Tmon10 >= 4 ? 'b' : (Tcold < -38 ? 'd' : 'c'));
    code = 'D' + s2 + s3;
  } else {                                              // E - polar / alta montaña
    code = Thot > 0 ? 'ET' : 'EF';
  }
  return { code, desc: KOPPEN_DESC[code] || KOPPEN_DESC[code.slice(0,2)] || 'Clima sin descripcion' };
}

export const KOPPEN_DESC = {
  Af:'Selva tropical siempre humeda (Los Tuxtlas, Chiapas bajo)',
  Am:'Monzonico tropical, seca corta (costa de Veracruz y Tabasco)',
  Aw:'Sabana tropical con lluvias de verano (costa del Pacifico, Yucatan)',
  As:'Tropical con lluvias de invierno (raro en Mexico)',
  BWh:'Desierto calido (Sonora, Baja California, Comarca Lagunera)',
  BWk:'Desierto frio de altiplano (Zacatecas, San Luis Potosi alto)',
  BSh:'Estepa calida, semiarido (Tamaulipas, valles de Sonora)',
  BSk:'Estepa fria de altiplano (Bajio seco, Chihuahua alto)',
  Cfa:'Templado humedo con verano caliente (Sierra Madre Oriental baja)',
  Cfb:'Templado humedo con verano fresco (bosque de niebla alto)',
  Cwa:'Templado subhumedo con lluvias de verano (Valle de Mexico, Puebla)',
  Cwb:'Templado de montaña con lluvias de verano (Toluca, Pachuca, Xalapa alto)',
  Cwc:'Frio de montaña con lluvias de verano (limite del bosque)',
  Csa:'Mediterraneo de verano seco caliente (noroeste de Baja California)',
  Csb:'Mediterraneo de verano seco fresco (Sierra de Juarez, BC)',
  Dwb:'Continental con invierno seco (cumbres del norte)',
  Dwc:'Continental subartico (excepcional, alta montaña)',
  ET:'Tundra alpina: ningun mes pasa de 10 °C (sobre 4,000 m)',
  EF:'Hielo permanente (cumbres del Orizaba y Popocatepetl)',
};

const LAPSE = 0.0065;  // °C por metro

export function ajustePorAltitud(normals, elevDEM){
  if (!Number.isFinite(elevDEM) || !Number.isFinite(normals.elevERA5)) return null;
  const dz = elevDEM - normals.elevERA5;
  const dT = -LAPSE * dz;
  return { dz, dT, Tajustada: normals.MAT + dT };
}

// ---------- climograma ----------
export function climographSVG(n, { w=308, h=150 } = {}){
  const padL = 26, padR = 26, padT = 12, padB = 18;
  const iw = w - padL - padR, ih = h - padT - padB;
  const pMax = Math.max(60, Math.ceil(Math.max(...n.P)/20)*20);
  const tMin = Math.min(0, Math.floor(Math.min(...n.T)/5)*5);
  const tMax = Math.max(20, Math.ceil(Math.max(...n.Tx)/5)*5);

  const xOf = i => padL + (i + 0.5) * (iw/12);
  const yP = v => padT + ih - (v/pMax)*ih;
  const yT = v => padT + ih - ((v - tMin)/(tMax - tMin))*ih;
  const bw = (iw/12) * 0.66;

  let s = `<svg class="climo" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">`;
  for (let g=0; g<=4; g++){
    const y = padT + ih*g/4;
    s += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${w-padR}" y2="${y.toFixed(1)}" stroke="#1a2430"/>`;
    s += `<text x="${padL-4}" y="${(y+3).toFixed(1)}" text-anchor="end" fill="#4a6fa5">${Math.round(pMax*(1-g/4))}</text>`;
    s += `<text x="${w-padR+4}" y="${(y+3).toFixed(1)}" fill="#c98a3c">${Math.round(tMax-(tMax-tMin)*g/4)}</text>`;
  }
  n.P.forEach((v,i) => {
    const bh = Math.max(0, padT + ih - yP(v));
    s += `<rect x="${(xOf(i)-bw/2).toFixed(1)}" y="${yP(v).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="#3d7fb5" opacity=".85" rx="1"/>`;
  });
  const band = n.T.map((v,i) => `${xOf(i).toFixed(1)},${yT(v).toFixed(1)}`).join(' ');
  const bandMax = n.Tx.map((v,i) => `${xOf(i).toFixed(1)},${yT(v).toFixed(1)}`).join(' ');
  const bandMin = n.Tn.map((v,i) => `${xOf(i).toFixed(1)},${yT(v).toFixed(1)}`).reverse().join(' ');
  s += `<polygon points="${bandMax} ${bandMin}" fill="#f0a63c" opacity=".14"/>`;
  s += `<polyline points="${band}" fill="none" stroke="#f0a63c" stroke-width="1.8" stroke-linejoin="round"/>`;
  if (tMin < 0){
    const y0 = yT(0);
    s += `<line x1="${padL}" y1="${y0.toFixed(1)}" x2="${w-padR}" y2="${y0.toFixed(1)}" stroke="#5aa9e6" stroke-dasharray="2 3" opacity=".6"/>`;
  }
  MESES.forEach((m,i) => {
    s += `<text x="${xOf(i).toFixed(1)}" y="${h-6}" text-anchor="middle">${m}</text>`;
  });
  s += `<text x="${padL-4}" y="${padT-3}" text-anchor="end" fill="#4a6fa5">mm</text>`;
  s += `<text x="${w-padR+4}" y="${padT-3}" fill="#c98a3c">°C</text>`;
  s += '</svg>';
  return s;
}

export function tablaMensual(n){
  let s = '<table class="mini-table"><tr><th>Mes</th><th>T med</th><th>T max</th><th>T min</th><th>Lluvia</th></tr>';
  for (let i=0;i<12;i++){
    s += `<tr><td>${MESES_L[i]}</td><td>${n.T[i].toFixed(1)}</td><td>${n.Tx[i].toFixed(1)}</td>`
       + `<td>${n.Tn[i].toFixed(1)}</td><td>${Math.round(n.P[i])}</td></tr>`;
  }
  s += `<tr style="border-top:1px solid #243040"><td><b>Año</b></td><td>${n.MAT.toFixed(1)}</td>`
     + `<td>${(n.Tx.reduce((a,b)=>a+b,0)/12).toFixed(1)}</td><td>${(n.Tn.reduce((a,b)=>a+b,0)/12).toFixed(1)}</td>`
     + `<td>${Math.round(n.MAP)}</td></tr></table>`;
  return s;
}

export { MESES_L };
