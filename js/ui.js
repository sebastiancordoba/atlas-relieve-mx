// Fabrica de controles y leyendas. Solo DOM: no conoce el estado de la app.

import { HYPSO, SLOPE_CLASSES, TRI, TPI, ASPECT_CLASSES, aspectColor } from './ramps.js';

export const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};

export function optionList(host, items, current, onPick){
  host.innerHTML = '';
  const nodes = new Map();
  for (const it of items){
    const n = el('div', 'opt' + (it.id === current ? ' on' : ''));
    n.innerHTML = `<span class="dot"></span><span class="txt"><b>${it.nombre}</b>`
      + (it.detalle ? `<small>${it.detalle}</small>` : '') + '</span>'
      + (it.tag ? `<span class="tag">${it.tag}</span>` : '');
    n.onclick = () => { select(it.id); onPick(it.id); };
    nodes.set(it.id, n);
    host.appendChild(n);
  }
  function select(id){ nodes.forEach((n,k) => n.classList.toggle('on', k === id)); }
  return { select };
}

export function slider(host, o){
  const row = el('div','row');
  row.innerHTML = `<label>${o.label}</label><span class="val"></span>`;
  const val = row.querySelector('.val');
  const input = el('input');
  input.type = 'range'; input.min = o.min; input.max = o.max; input.step = o.step ?? 1;
  input.value = o.value;
  const fmt = o.format || (v => v);
  const show = () => { val.textContent = fmt(+input.value); };
  input.oninput = () => { show(); o.onInput(+input.value); };
  show();
  host.appendChild(row);
  host.appendChild(input);
  return { input, set(v){ input.value = v; show(); } };
}

export function toggle(host, o){
  const n = el('label','switch' + (o.value ? ' on' : ''));
  n.innerHTML = `<span class="track"></span><span>${o.label}</span>`;
  n.onclick = () => { const on = !n.classList.contains('on'); n.classList.toggle('on', on); o.onChange(on); };
  host.appendChild(n);
  return { set(v){ n.classList.toggle('on', v); } };
}

export function selector(host, o){
  const row = el('div','row');
  row.innerHTML = `<label>${o.label}</label>`;
  const s = el('select');
  for (const [v,t] of o.options){
    const op = el('option'); op.value = v; op.textContent = t;
    if (String(v) === String(o.value)) op.selected = true;
    s.appendChild(op);
  }
  s.onchange = () => o.onChange(s.value);
  row.appendChild(s);
  host.appendChild(row);
  return s;
}

export function dateInput(host, o){
  const row = el('div','row');
  row.innerHTML = `<label>${o.label}</label>`;
  const i = el('input'); i.type = 'date'; i.value = o.value;
  if (o.max) i.max = o.max;
  i.onchange = () => o.onChange(i.value);
  row.appendChild(i);
  host.appendChild(row);
  return i;
}

export function button(host, o){
  const b = el('button','btn' + (o.on ? ' on' : ''));
  b.innerHTML = o.label + (o.kbd ? `<kbd>${o.kbd}</kbd>` : '');
  b.onclick = () => o.onClick(b);
  host.appendChild(b);
  return b;
}

export function initAccordions(root){
  root.querySelectorAll('.sec > h2').forEach(h => {
    h.onclick = () => {
      const s = h.parentElement;
      s.dataset.open = s.dataset.open === '1' ? '0' : '1';
    };
  });
}

// ---------- leyendas ----------
function gradient(stops, min, max){
  const parts = stops
    .filter(s => s[0] >= min && s[0] <= max)
    .map(s => `${s[1]} ${(((s[0]-min)/(max-min))*100).toFixed(1)}%`);
  return `linear-gradient(90deg, ${parts.join(',')})`;
}

export function legendHTML(kind, envCfg, opts={}){
  if (kind === 'hypso'){
    return `<h4>Altitud</h4>
      <div class="bar" style="background:${gradient(HYPSO,0,5700)}"></div>
      <div class="ticks"><span>0 m</span><span>1,400</span><span>2,700</span><span>4,000</span><span>5,700</span></div>
      <div class="sub">Pisos altitudinales. El mar y la batimetria aparecen en azul.</div>`;
  }
  if (kind === 'slope'){
    const items = SLOPE_CLASSES.map(([a,b,c,txt]) =>
      `<div class="item"><span class="sw" style="background:${c}"></span>${a}–${b === 90 ? '90' : b}° · ${txt}</div>`).join('');
    return `<h4>Pendiente</h4><div class="items">${items}</div>
      <div class="sub">Metodo de Horn 3×3 sobre DEM de ~30 m.</div>`;
  }
  if (kind === 'aspect'){
    const items = ASPECT_CLASSES.map(([n,,a]) => {
      const c = aspectColor((a + 22.5) % 360).map(Math.round);
      return `<div class="item"><span class="sw" style="background:rgb(${c})"></span>${n}</div>`;
    }).join('');
    return `<h4>Orientacion de ladera</h4>
      <div class="items" style="grid-template-columns:1fr 1fr">${items}</div>
      <div class="sub">Las laderas S y O reciben mas insolacion; las N conservan humedad.</div>`;
  }
  if (kind === 'tri'){
    return `<h4>Rugosidad (TRI)</h4>
      <div class="bar" style="background:${gradient(TRI,0,240)}"></div>
      <div class="ticks"><span>0 m</span><span>60</span><span>120</span><span>240+</span></div>
      <div class="sub">Diferencia de altura con las celdas vecinas: llanura, lomerio o roca desnuda.</div>`;
  }
  if (kind === 'tpi'){
    return `<h4>Posicion topografica</h4>
      <div class="bar" style="background:${gradient(TPI,-60,60)}"></div>
      <div class="ticks"><span>valle −60 m</span><span>ladera 0</span><span>cresta +60</span></div>
      <div class="sub">Altura relativa al entorno (${(opts.tpiRadius ?? 8)*2+1} celdas). Separa fondos de valle, laderas y parteaguas.</div>`;
  }
  if (kind === 'env' && envCfg?.leyenda){
    const st = envCfg.leyenda.stops;
    const bar = `linear-gradient(90deg, ${st.map((s,i) => `${s[0]} ${(i/(st.length-1)*100).toFixed(0)}%`).join(',')})`;
    const ticks = st.map(s => `<span>${s[1]}</span>`).join('');
    return `<h4>${envCfg.nombre}</h4><div class="bar" style="background:${bar}"></div>
      <div class="ticks">${ticks}</div><div class="sub">${envCfg.leyenda.sub}</div>`;
  }
  return '';
}

export function fmt(n, d=0){
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('es-MX', { minimumFractionDigits:d, maximumFractionDigits:d });
}

export function dms(v, pos, neg){
  const h = v >= 0 ? pos : neg, a = Math.abs(v);
  const d = Math.floor(a), m = Math.floor((a-d)*60), s = ((a-d)*60-m)*60;
  return `${d}°${String(m).padStart(2,'0')}'${s.toFixed(1).padStart(4,'0')}"${h}`;
}
