// Atlas de Relieve — orquestador: estado, capas y eventos.

import { BASEMAPS, ENV_LAYERS, ANALYSIS_LAYERS, PLACES, FUENTES, LABELS_LAYER,
         DEM_SOURCES, gibsUrl } from './config.js';
import { getDemSource, setDemSource, metersPerPixel, elevationAt, cacheStats } from './dem.js';
import { registerAnalysisProtocol, setAnalysisOptions, analysisTiles } from './analysis.js';
import { optionList, slider, toggle, selector, dateInput, button, initAccordions,
         legendHTML, fmt, el } from './ui.js';
import { inspect } from './inspect.js';
import { sampleProfile, stats, profileSVG, statsHTML, suavizar } from './profile.js';
import { PROYECCIONES, AMBITOS } from './projections.js';
import { render as renderProyeccion } from './reproject.js';

// ---------------------------------------------------------------- estado
const DEF = {
  base:'esri-sat', labels:true, terrain:false, exageracion:1.5, proyeccion:'mercator',
  hillshade:true, hsIntensidad:0.45, hsAzimut:315,
  analisis:'none', anOpacidad:0.72, anZoom:13,
  curvas:false, intervalo:100,
  env:'none', envFecha:null, envOpacidad:0.75,
  herramienta:'inspect',
};
const state = { ...DEF, ...cargarEstado() };
if (!state.envFecha) state.envFecha = fechaOffset(3);

function cargarEstado(){
  try { return JSON.parse(localStorage.getItem('atlas-relieve') || '{}'); }
  catch { return {}; }
}
function guardarEstado(){
  try { localStorage.setItem('atlas-relieve', JSON.stringify(state)); } catch {}
  escribirHash();
}
function fechaOffset(dias){
  const d = new Date(Date.now() - dias*864e5);
  return d.toISOString().slice(0,10);
}

function leerHash(){
  const h = location.hash.slice(1);
  if (!h) return null;
  const [pos, extra] = h.split('&');
  const p = pos.split('/').map(Number);
  if (p.length < 3 || p.some(Number.isNaN)) return null;
  if (extra) for (const kv of extra.split(',')){
    const [k,v] = kv.split('=');
    if (k === 'b') state.base = v;
    if (k === 'a') state.analisis = v;
    if (k === 'e') state.env = v;
    if (k === 't') state.terrain = v === '1';
    if (k === 'p') state.proyeccion = v;
  }
  return { zoom:p[0], lat:p[1], lon:p[2], bearing:p[3]||0, pitch:p[4]||0 };
}
let hashTimer;
function escribirHash(){
  if (!map) return;
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const c = map.getCenter();
    const h = `#${map.getZoom().toFixed(2)}/${c.lat.toFixed(5)}/${c.lng.toFixed(5)}`
      + `/${map.getBearing().toFixed(0)}/${map.getPitch().toFixed(0)}`
      + `&b=${state.base},a=${state.analisis},e=${state.env},t=${state.terrain?1:0}`
      + `,p=${state.proyeccion}`;
    history.replaceState(null, '', h);
  }, 400);
}

// ---------------------------------------------------------------- mapa
registerAnalysisProtocol();
const dem = getDemSource();
const inicio = leerHash() || { zoom:5.3, lat:23.6, lon:-102.5, bearing:0, pitch:0 };

const map = new maplibregl.Map({
  container:'map',
  style:{
    version:8,
    sources:{
      dem:{ type:'raster-dem', tiles:[dem.url], encoding:dem.encoding,
            tileSize:256, maxzoom:dem.maxzoom, attribution:dem.attribution },
    },
    layers:[{ id:'bg', type:'background', paint:{ 'background-color':'#05080c' } }],
  },
  center:[inicio.lon, inicio.lat], zoom:inicio.zoom,
  bearing:inicio.bearing, pitch:inicio.pitch,
  maxPitch:85, minZoom:2, maxZoom:19,
  attributionControl:{ compact:true },
});

map.addControl(new maplibregl.NavigationControl({ visualizePitch:true }), 'top-right');
map.addControl(new maplibregl.ScaleControl({ maxWidth:110, unit:'metric' }), 'bottom-right');
map.addControl(new maplibregl.GeolocateControl({ trackUserLocation:false }), 'top-right');

const ORDEN = ['l-base','l-env','l-analysis','l-hillshade','l-contours','l-labels','l-profile-line','l-profile-pts'];
const antesDe = id => {
  const i = ORDEN.indexOf(id);
  for (let j=i+1;j<ORDEN.length;j++) if (map.getLayer(ORDEN[j])) return ORDEN[j];
  return undefined;
};
function quitar(layer, source){
  if (map.getLayer(layer)) map.removeLayer(layer);
  if (source && map.getSource(source)) map.removeSource(source);
}
function ponerRaster({ layer, source, tiles, maxzoom, opacity, attribution, tileSize=256 }){
  quitar(layer, source);
  map.addSource(source, { type:'raster', tiles, tileSize, maxzoom, attribution });
  map.addLayer({ id:layer, type:'raster', source, paint:{ 'raster-opacity':opacity, 'raster-fade-duration':180 } }, antesDe(layer));
}

// ---------------------------------------------------------------- capas
function aplicarBase(){
  const b = BASEMAPS.find(x => x.id === state.base) || BASEMAPS[0];
  quitar('l-base','base-src');
  if (b.tiles || b.gibs){
    const tiles = b.gibs ? [gibsUrl(b.gibs.layer, b.gibs.level, state.envFecha, b.gibs.format)] : b.tiles;
    ponerRaster({ layer:'l-base', source:'base-src', tiles, maxzoom:b.maxzoom, opacity:1, attribution:b.attribution });
  }
  actualizarEstado();
}

function aplicarEtiquetas(){
  quitar('l-labels','lb-src');
  if (state.labels)
    ponerRaster({ layer:'l-labels', source:'lb-src', tiles:LABELS_LAYER.tiles,
      maxzoom:LABELS_LAYER.maxzoom, opacity:0.9, attribution:LABELS_LAYER.attribution });
}

function aplicarAnalisis(){
  quitar('l-analysis','an-src');
  if (state.analisis !== 'none'){
    ponerRaster({ layer:'l-analysis', source:'an-src', tiles:analysisTiles(state.analisis),
      maxzoom:state.anZoom, opacity:state.anOpacidad, attribution:getDemSource().attribution });
  }
  aplicarLeyenda();
}

function aplicarCurvas(){
  quitar('l-contours','ct-src');
  if (state.curvas){
    ponerRaster({ layer:'l-contours', source:'ct-src', tiles:analysisTiles('contours'),
      maxzoom:Math.min(state.anZoom+1, getDemSource().maxzoom), opacity:0.95 });
  }
}

function aplicarSombreado(){
  if (map.getLayer('l-hillshade')) map.removeLayer('l-hillshade');
  if (!state.hillshade) return;
  map.addLayer({
    id:'l-hillshade', type:'hillshade', source:'dem',
    paint:{
      'hillshade-exaggeration':state.hsIntensidad,
      'hillshade-illumination-direction':state.hsAzimut,
      'hillshade-shadow-color':'rgba(5,10,16,0.88)',
      'hillshade-highlight-color':'rgba(255,241,214,0.5)',
      'hillshade-accent-color':'rgba(0,0,0,0)',
    },
  }, antesDe('l-hillshade'));
}

const VISTAS_MAPA = {
  mercator:{ type:'mercator' },
  globo:{ type:'globe' },
  auto:{ type:['interpolate',['linear'],['zoom'], 3,'vertical-perspective', 6,'mercator'] },
};
function aplicarProyeccion(){
  try { map.setProjection(VISTAS_MAPA[state.proyeccion] || VISTAS_MAPA.mercator); }
  catch (e) { mensaje('Proyeccion no disponible en esta version'); }
  actualizarEstado();
}

function aplicarTerreno(){
  map.setTerrain(state.terrain ? { source:'dem', exaggeration:state.exageracion } : null);
  if (state.terrain && map.getPitch() < 25) map.easeTo({ pitch:60, duration:700 });
}

function aplicarEnv(){
  quitar('l-env','env-src');
  const cfg = ENV_LAYERS.find(x => x.id === state.env);
  if (cfg && cfg.id !== 'none'){
    const fecha = cfg.temporal ? state.envFecha : null;
    ponerRaster({ layer:'l-env', source:'env-src',
      tiles:[gibsUrl(cfg.layer, cfg.level, fecha, cfg.format)],
      maxzoom:cfg.level, opacity:state.envOpacidad,
      attribution:'NASA EOSDIS GIBS' });
  }
  aplicarLeyenda();
}

const $legend = document.getElementById('legend');
function aplicarLeyenda(){
  const cfg = ENV_LAYERS.find(x => x.id === state.env);
  let html = '';
  if (state.analisis !== 'none') html += legendHTML(state.analisis, null, { tpiRadius:8 });
  if (cfg && cfg.id !== 'none'){
    if (html) html += '<div style="height:10px"></div>';
    html += legendHTML('env', cfg);
  }
  $legend.innerHTML = html;
  $legend.classList.toggle('hidden', !html);
}

function refrescarTodo(){
  aplicarBase(); aplicarEnv(); aplicarAnalisis(); aplicarSombreado(); aplicarCurvas();
  aplicarEtiquetas(); aplicarTerreno(); aplicarProyeccion(); aplicarLeyenda(); guardarEstado();
}

// ---------------------------------------------------------------- panel lateral
function construirPanel(){
  document.querySelectorAll('.sec > .body').forEach(b => b.innerHTML = '');
  optionList(document.getElementById('sec-base'), BASEMAPS, state.base, id => {
    state.base = id; aplicarBase(); guardarEstado();
  });
  const hostBase = document.getElementById('sec-base');
  toggle(hostBase, { label:'Etiquetas de lugares', value:state.labels,
    onChange:v => { state.labels = v; aplicarEtiquetas(); guardarEstado(); } });

  const t = document.getElementById('sec-terrain');
  toggle(t, { label:'Terreno 3D', value:state.terrain,
    onChange:v => { state.terrain = v; aplicarTerreno(); guardarEstado(); } });
  slider(t, { label:'Exageracion', min:1, max:4, step:0.1, value:state.exageracion,
    format:v => v.toFixed(1)+'×',
    onInput:v => { state.exageracion = v; if (state.terrain) aplicarTerreno(); guardarEstado(); } });
  toggle(t, { label:'Sombreado del relieve', value:state.hillshade,
    onChange:v => { state.hillshade = v; aplicarSombreado(); guardarEstado(); } });
  slider(t, { label:'Intensidad', min:0, max:1, step:0.05, value:state.hsIntensidad,
    format:v => Math.round(v*100)+'%',
    onInput:v => { state.hsIntensidad = v;
      if (map.getLayer('l-hillshade')) map.setPaintProperty('l-hillshade','hillshade-exaggeration',v);
      guardarEstado(); } });
  slider(t, { label:'Azimut del sol', min:0, max:360, step:5, value:state.hsAzimut,
    format:v => v+'°',
    onInput:v => { state.hsAzimut = v;
      if (map.getLayer('l-hillshade')) map.setPaintProperty('l-hillshade','hillshade-illumination-direction',v);
      guardarEstado(); } });
  t.appendChild(el('div','hintline','Con el terreno activo, arrastra con clic derecho (o dos dedos) para inclinar la camara.'));

  t.appendChild(el('div','block-title','Proyeccion'));
  selector(t, { label:'Vista', value:state.proyeccion,
    options:[['mercator','Web Mercator (plana)'],['globo','Globo (areas reales)'],['auto','Globo lejos, plana cerca']],
    onChange:v => { state.proyeccion = v; aplicarProyeccion(); guardarEstado(); } });
  t.appendChild(el('div','note','Mercator conserva los angulos: por eso la pendiente y la orientacion se '
    + 'calculan bien sobre el. Lo que deforma son las areas, y la barra inferior te dice cuanto.'));

  const a = document.getElementById('sec-analysis');
  optionList(a, ANALYSIS_LAYERS, state.analisis, id => {
    state.analisis = id; aplicarAnalisis(); guardarEstado();
  });
  slider(a, { label:'Opacidad', min:0, max:1, step:0.05, value:state.anOpacidad,
    format:v => Math.round(v*100)+'%',
    onInput:v => { state.anOpacidad = v;
      if (map.getLayer('l-analysis')) map.setPaintProperty('l-analysis','raster-opacity',v);
      guardarEstado(); } });
  selector(a, { label:'Detalle', value:state.anZoom,
    options:[[11,'Regional · 72 m'],[12,'Nativo · 36 m'],[13,'Fino · 18 m'],[14,'Maximo · 9 m']],
    onChange:v => { state.anZoom = +v; aplicarAnalisis(); aplicarCurvas(); guardarEstado(); } });
  toggle(a, { label:'Curvas de nivel', value:state.curvas,
    onChange:v => { state.curvas = v; aplicarCurvas(); guardarEstado(); } });
  selector(a, { label:'Equidistancia', value:state.intervalo,
    options:[[20,'20 m'],[50,'50 m'],[100,'100 m'],[200,'200 m'],[500,'500 m']],
    onChange:v => { state.intervalo = +v; setAnalysisOptions({ interval:+v });
      aplicarCurvas(); aplicarAnalisis(); guardarEstado(); } });
  a.appendChild(el('div','note','El DEM global tiene ~30 m de paso. Por encima de "Nativo" el calculo interpola: '
    + 'se ve mas suave, pero no agrega informacion real.'));

  const e = document.getElementById('sec-env');
  optionList(e, ENV_LAYERS, state.env, id => { state.env = id; aplicarEnv(); guardarEstado(); });
  dateInput(e, { label:'Fecha', value:state.envFecha, max:fechaOffset(1),
    onChange:v => { state.envFecha = v; aplicarEnv(); if (state.base === 'gibs-truecolor') aplicarBase(); guardarEstado(); } });
  slider(e, { label:'Opacidad', min:0, max:1, step:0.05, value:state.envOpacidad,
    format:v => Math.round(v*100)+'%',
    onInput:v => { state.envOpacidad = v;
      if (map.getLayer('l-env')) map.setPaintProperty('l-env','raster-opacity',v);
      guardarEstado(); } });
  e.appendChild(el('div','hintline','Las capas diarias pueden tardar unas horas en publicarse; si sale vacia, retrocede un dia.'));

  const h = document.getElementById('sec-tools');
  const bIns = button(h, { label:'Inspeccionar punto', kbd:'I', on:state.herramienta === 'inspect',
    onClick:() => setHerramienta('inspect') });
  const bPer = button(h, { label:'Perfil topografico', kbd:'P', on:state.herramienta === 'profile',
    onClick:() => setHerramienta('profile') });
  botones.inspect = bIns; botones.profile = bPer;
  const g = el('div','btn-grid'); g.style.marginTop = '6px';
  h.appendChild(g);
  button(g, { label:'Norte arriba', onClick:() => map.easeTo({ bearing:0, pitch:state.terrain?60:0 }) });
  button(g, { label:'Vista cenital', onClick:() => map.easeTo({ pitch:0, bearing:0 }) });
  button(g, { label:'Copiar enlace', onClick:b => {
    navigator.clipboard?.writeText(location.href);
    b.textContent = 'Enlace copiado'; setTimeout(() => b.textContent = 'Copiar enlace', 1500);
  } });
  button(g, { label:'Vista de proyeccion', onClick:() => abrirProyeccion() });
  button(g, { label:'Restablecer', onClick:() => {
    Object.assign(state, DEF, { envFecha:fechaOffset(3) });
    localStorage.removeItem('atlas-relieve');
    construirPanel(); refrescarTodo();
  } });
  h.appendChild(el('div','hintline','Atajos: I inspeccionar · P perfil · 3 terreno · C curvas · H sombreado · V proyeccion · Esc cerrar.'));

  const p = document.getElementById('sec-places');
  for (const pl of PLACES){
    const n = el('div','opt');
    n.innerHTML = `<span class="dot"></span><span class="txt"><b>${pl.n}</b><small>${pl.d}</small></span>`;
    n.onclick = () => map.flyTo({ center:pl.c, zoom:pl.z, pitch:state.terrain ? pl.p : 0,
      bearing:state.terrain ? pl.b : 0, duration:1800, essential:true });
    p.appendChild(n);
  }

  construirFuentes();
  pintarInstalar();
}
const botones = {};

function construirFuentes(){
  const s = document.getElementById('sec-sources');
  s.innerHTML = '<div id="detalle-vivo" class="note" style="border-left-color:var(--teal)"></div>';
  const tabla = el('table','src');
  tabla.innerHTML = '<tr><th>Fuente</th><th>Resolucion</th><th>Zoom</th></tr>'
    + FUENTES.map(f => `<tr><td><b>${f[0]}</b><br><span style="font-size:10px">${f[3]}</span></td>`
      + `<td class="num">${f[1]}</td><td class="num">${f[2]}</td></tr>`).join('');
  s.appendChild(tabla);

  s.appendChild(el('div','block-title','DEM personalizado'));
  s.appendChild(el('div','hintline','Pega un servicio de teselas propio (por ejemplo el CEM 15 m del INEGI '
    + 'publicado con tu propio tiler) para analizar con mas detalle.'));
  const inp = el('input'); inp.type = 'text'; inp.value = getDemSource().url;
  inp.style.marginTop = '6px'; s.appendChild(inp);
  const sel = el('select');
  sel.innerHTML = '<option value="terrarium">Codificacion terrarium</option><option value="mapbox">Codificacion terrain-RGB</option>';
  sel.value = getDemSource().encoding; sel.style.marginTop = '6px'; s.appendChild(sel);
  const bg = el('div','btn-grid'); bg.style.marginTop = '6px'; s.appendChild(bg);
  button(bg, { label:'Aplicar DEM', onClick:() => cambiarDem(inp.value.trim(), sel.value) });
  button(bg, { label:'Volver al global', onClick:() => {
    inp.value = DEM_SOURCES.terrarium.url; sel.value = 'terrarium';
    cambiarDem(DEM_SOURCES.terrarium.url, 'terrarium');
  } });

  s.appendChild(el('div','block-title','Uso sin conexion'));
  const uso = el('div','hintline','Calculando espacio en cache…');
  s.appendChild(uso);
  usoCache().then(b => {
    uso.textContent = b == null
      ? 'El navegador no reporta el espacio usado.'
      : `Las teselas que ya viste ocupan ${(b/1048576).toFixed(1)} MB y siguen disponibles sin red.`;
  });
  button(s, { label:'Vaciar cache de teselas', onClick:b => {
    navigator.serviceWorker?.controller?.postMessage('limpiar-teselas');
    b.textContent = 'Cache vaciada';
    setTimeout(() => b.textContent = 'Vaciar cache de teselas', 1600);
  } }).style.marginTop = '6px';

  actualizarEstado();
}

function cambiarDem(url, encoding){
  if (!/\{z\}/.test(url)) { mensaje('La URL debe incluir {z}/{x}/{y}'); return; }
  setDemSource({ url, encoding, maxzoom:encoding === 'mapbox' ? 15 : 15 });
  if (map.getSource('dem')) {
    map.setTerrain(null);
    if (map.getLayer('l-hillshade')) map.removeLayer('l-hillshade');
    map.removeSource('dem');
  }
  const d = getDemSource();
  map.addSource('dem', { type:'raster-dem', tiles:[d.url], encoding:d.encoding, tileSize:256, maxzoom:d.maxzoom });
  setAnalysisOptions({});
  aplicarSombreado(); aplicarTerreno(); aplicarAnalisis(); aplicarCurvas();
  mensaje('DEM actualizado');
}

// ---------------------------------------------------------------- herramientas
function setHerramienta(h){
  state.herramienta = h;
  botones.inspect?.classList.toggle('on', h === 'inspect');
  botones.profile?.classList.toggle('on', h === 'profile');
  map.getCanvas().style.cursor = h === 'profile' ? 'crosshair' : '';
  if (h === 'profile') mensaje('Clic para marcar el perfil · doble clic para cerrar');
  guardarEstado();
}

let marcador = null;
function ponerMarcador(lng, lat){
  if (!marcador){
    const d = el('div');
    d.style.cssText = 'width:16px;height:16px;border:2px solid #f0a63c;border-radius:50%;'
      + 'box-shadow:0 0 0 2px rgba(0,0,0,.5), inset 0 0 0 2px rgba(0,0,0,.35)';
    marcador = new maplibregl.Marker({ element:d }).setLngLat([lng,lat]).addTo(map);
  } else marcador.setLngLat([lng,lat]);
}

const $inspector = document.getElementById('inspector');
const $inspBody = document.getElementById('inspector-body');
async function inspeccionar(lng, lat){
  ponerMarcador(lng, lat);
  $inspector.classList.remove('hidden');
  await inspect($inspBody, lat, lng, { analysisZoom:state.anZoom });
}

// --- perfil
let perfilPts = [];
const $profile = document.getElementById('profile');
const $profBody = document.getElementById('profile-body');

function dibujarLinea(){
  const fc = {
    type:'FeatureCollection',
    features:[
      ...(perfilPts.length > 1 ? [{ type:'Feature', geometry:{ type:'LineString', coordinates:perfilPts } }] : []),
      ...perfilPts.map(c => ({ type:'Feature', geometry:{ type:'Point', coordinates:c } })),
    ],
  };
  if (map.getSource('pf-src')) { map.getSource('pf-src').setData(fc); return; }
  map.addSource('pf-src', { type:'geojson', data:fc });
  map.addLayer({ id:'l-profile-line', type:'line', source:'pf-src',
    filter:['==','$type','LineString'],
    paint:{ 'line-color':'#45c2a4', 'line-width':2.5, 'line-dasharray':[2,1] } }, antesDe('l-profile-line'));
  map.addLayer({ id:'l-profile-pts', type:'circle', source:'pf-src',
    filter:['==','$type','Point'],
    paint:{ 'circle-radius':4.5, 'circle-color':'#45c2a4', 'circle-stroke-width':2, 'circle-stroke-color':'#0a0e13' } });
}

async function calcularPerfil(){
  if (perfilPts.length < 2) return;
  $profile.classList.remove('hidden');
  $profBody.innerHTML = '<div class="loading"><span class="spin"></span>Muestreando el terreno…</div>';
  const z = Math.min(state.anZoom, getDemSource().maxzoom);
  const { pts: crudos } = await sampleProfile(perfilPts, z, 340);
  const pts = suavizar(crudos, 5);
  const st = stats(pts);
  if (!st){ $profBody.innerHTML = '<div class="note">Sin datos de elevacion en ese tramo.</div>'; return; }
  $profBody.innerHTML = statsHTML(st) + profileSVG(pts, st) + '<div class="hintline" id="prof-read"></div>';
  enlazarHover(pts, st);
}

function enlazarHover(pts, st){
  const svg = $profBody.querySelector('svg');
  const cursor = svg.querySelector('#prof-cursor');
  const read = document.getElementById('prof-read');
  let hoverMark = null;
  svg.onpointermove = ev => {
    const r = svg.getBoundingClientRect();
    const frac = (ev.clientX - r.left) / r.width;
    const vb = svg.viewBox.baseVal;
    const xv = frac * vb.width;
    const d = Math.max(0, Math.min(st.total, (xv - 44)/(vb.width-56) * st.total));
    const i = Math.max(0, Math.min(pts.length-1, Math.round(d/st.total*(pts.length-1))));
    const p = pts[i];
    cursor.setAttribute('x1', xv); cursor.setAttribute('x2', xv); cursor.setAttribute('opacity','1');
    read.textContent = `${fmt(p.d/1000,2)} km · ${fmt(p.h,0)} m · ${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}`;
    if (!hoverMark){
      const dd = el('div');
      dd.style.cssText = 'width:12px;height:12px;background:#45c2a4;border:2px solid #0a0e13;border-radius:50%';
      hoverMark = new maplibregl.Marker({ element:dd });
    }
    hoverMark.setLngLat([p.lon,p.lat]).addTo(map);
  };
  svg.onpointerleave = () => { cursor.setAttribute('opacity','0'); hoverMark?.remove(); };
}

function limpiarPerfil(){
  perfilPts = [];
  dibujarLinea();
  $profile.classList.add('hidden');
}
document.getElementById('profile-clear').onclick = limpiarPerfil;

// ---------------------------------------------------------------- vista de proyeccion
const proyEstado = {
  proyeccion:'equal-earth', ambito:'mexico', capa:'base',
  reticula:true, tissot:false, ancho:1400, ultimo:null,
};

const CAPAS_PROY = [
  ['base','Mapa base actual'],
  ['hypso','Altitud (hipsometrica)'],
  ['slope','Pendiente'],
  ['aspect','Orientacion de ladera'],
  ['tri','Rugosidad'],
  ['tpi','Posicion topografica'],
  ['env','Capa ambiental actual'],
];

function fuenteProyeccion(){
  if (proyEstado.capa === 'base'){
    const b = BASEMAPS.find(x => x.id === state.base);
    if (!b || (!b.tiles && !b.gibs)) return { tiles:[BASEMAPS[0].tiles[0]], maxzoom:BASEMAPS[0].maxzoom };
    const tiles = b.gibs ? [gibsUrl(b.gibs.layer, b.gibs.level, state.envFecha, b.gibs.format)] : b.tiles;
    return { tiles, maxzoom:b.maxzoom };
  }
  if (proyEstado.capa === 'env'){
    const cfg = ENV_LAYERS.find(x => x.id === state.env);
    if (!cfg || cfg.id === 'none') return null;
    return { tiles:[gibsUrl(cfg.layer, cfg.level, cfg.temporal ? state.envFecha : null, cfg.format)],
             maxzoom:cfg.level };
  }
  return { analisis:proyEstado.capa, maxzoom:Math.min(state.anZoom, getDemSource().maxzoom) };
}

function abrirProyeccion(){
  document.getElementById('proyeccion').classList.remove('hidden');
  construirControlesProy();
  generarProyeccion();
}

function construirControlesProy(){
  const host = document.getElementById('proy-controles');
  host.innerHTML = '';
  const grupo = (etiqueta, nodo) => {
    const g = el('div','grp');
    g.appendChild(el('label', null, etiqueta));
    g.appendChild(nodo);
    host.appendChild(g);
    return nodo;
  };
  const sel = (opciones, valor, onChange) => {
    const n = el('select');
    for (const [v,t] of opciones){
      const o = el('option'); o.value = v; o.textContent = t;
      if (v === valor) o.selected = true;
      n.appendChild(o);
    }
    n.onchange = () => { onChange(n.value); generarProyeccion(); };
    return n;
  };

  grupo('Proyeccion', sel(PROYECCIONES.map(p => [p.id, `${p.nombre} — ${p.propiedad}`]),
    proyEstado.proyeccion, v => proyEstado.proyeccion = v));
  grupo('Ambito', sel(Object.entries(AMBITOS).map(([k,a]) => [k, a.nombre]).concat([['vista','Vista actual']]),
    proyEstado.ambito, v => proyEstado.ambito = v));
  grupo('Capa', sel(CAPAS_PROY, proyEstado.capa, v => proyEstado.capa = v));
  grupo('Ancho', sel([[900,'900 px'],[1400,'1400 px'],[2000,'2000 px']].map(([v,t]) => [String(v),t]),
    String(proyEstado.ancho), v => proyEstado.ancho = +v));

  const t1 = el('label','switch' + (proyEstado.reticula ? ' on' : ''));
  t1.innerHTML = '<span class="track"></span><span>Reticula</span>';
  t1.onclick = () => { proyEstado.reticula = !proyEstado.reticula; t1.classList.toggle('on'); generarProyeccion(); };
  host.appendChild(t1);

  const t2 = el('label','switch' + (proyEstado.tissot ? ' on' : ''));
  t2.innerHTML = '<span class="track"></span><span>Indicatrices de Tissot</span>';
  t2.onclick = () => { proyEstado.tissot = !proyEstado.tissot; t2.classList.toggle('on'); generarProyeccion(); };
  host.appendChild(t2);
}

let peticionProy = 0;
async function generarProyeccion(){
  const mia = ++peticionProy;           // una peticion nueva releva a la anterior
  const host = document.getElementById('proy-lienzo');
  const nota = document.getElementById('proy-nota');
  const fuente = fuenteProyeccion();
  if (!fuente){
    host.innerHTML = '<div class="loading">Activa primero una capa ambiental en el panel.</div>';
    return;
  }
  host.innerHTML = '<div class="loading"><span class="spin"></span>Descargando teselas…</div>';
  const aviso = host.querySelector('.loading');

  let bounds = null;
  if (proyEstado.ambito === 'vista'){
    const b = map.getBounds();
    bounds = [b.getWest(), Math.max(-85, b.getSouth()), b.getEast(), Math.min(85, b.getNorth())];
  }

  try{
    await new Promise(r => requestAnimationFrame(r));
    const out = await renderProyeccion({
      proyeccion:proyEstado.proyeccion,
      ambito:proyEstado.ambito === 'vista' ? null : proyEstado.ambito,
      bounds,
      fuente,
      ancho:proyEstado.ancho,
      presupuesto:fuente.analisis ? 36 : 80,
      reticula:proyEstado.reticula,
      tissot:proyEstado.tissot,
      onProgreso:(hechas, total) => {
        if (aviso && mia === peticionProy)
          aviso.innerHTML = `<span class="spin"></span>Teselas ${hechas} / ${total}…`;
      },
    });
    if (mia !== peticionProy) return;   // llego una peticion mas nueva mientras tanto

    const lienzo = out.canvas.transferToImageBitmap
      ? (() => { const cv = document.createElement('canvas');
                 cv.width = out.ancho; cv.height = out.alto;
                 cv.getContext('2d').drawImage(out.canvas, 0, 0);
                 return cv; })()
      : out.canvas;
    host.innerHTML = '';
    host.appendChild(lienzo);
    proyEstado.ultimo = lienzo;

    const P = out.proyeccion;
    nota.innerHTML = `<span class="badge">${P.propiedad}</span>
      <span>${P.nota}
        <div class="proj-meta">Mosaico de ${out.mosaico.teselas} teselas a z${out.mosaico.z}
          (${fmt(out.mosaico.metros * Math.cos(((out.bounds[1]+out.bounds[3])/2)*Math.PI/180), 0)} m por pixel de origen)
          · lienzo ${out.ancho}×${out.alto} px</div>
      </span>`;
  }catch(e){
    if (mia === peticionProy) host.innerHTML = `<div class="loading">No se pudo generar: ${e.message}</div>`;
  }
}

document.getElementById('proy-descargar').onclick = () => {
  const cv = proyEstado.ultimo;
  if (!cv) return;
  cv.toBlob(b => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = `proyeccion-${proyEstado.proyeccion}-${proyEstado.capa}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, 'image/png');
};

// ---------------------------------------------------------------- eventos
map.on('load', () => {
  setAnalysisOptions({ interval:state.intervalo });
  refrescarTodo();
  construirPanel();
  setHerramienta(state.herramienta);
  setTimeout(() => document.getElementById('hint').classList.add('gone'), 7000);
});

map.on('click', ev => {
  if (state.herramienta === 'profile'){
    perfilPts.push([ev.lngLat.lng, ev.lngLat.lat]);
    dibujarLinea();
    if (perfilPts.length >= 2) calcularPerfil();
  } else {
    inspeccionar(ev.lngLat.lng, ev.lngLat.lat);
  }
});
map.on('dblclick', ev => {
  if (state.herramienta === 'profile'){ ev.preventDefault(); setHerramienta('inspect'); }
});

map.on('move', () => { actualizarEstado(); escribirHash(); });

let mmTimer;
map.on('mousemove', ev => {
  const { lng, lat } = ev.lngLat;
  document.getElementById('st-coords').textContent =
    `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`;
  clearTimeout(mmTimer);
  mmTimer = setTimeout(async () => {
    const h = await elevationAt(lat, lng, Math.min(state.anZoom, getDemSource().maxzoom));
    document.getElementById('st-elev').textContent = Number.isFinite(h) ? `${fmt(h,0)} m` : '—';
  }, 120);
});

function actualizarEstado(){
  const z = map.getZoom(), lat = map.getCenter().lat;
  const res = metersPerPixel(lat, z+1);
  const inflacion = 1 / Math.cos(lat*Math.PI/180)**2;
  const $d = document.getElementById('st-dist');
  if ($d) $d.textContent = state.proyeccion === 'mercator'
    ? `area ×${inflacion.toFixed(2)}` : 'area fiel';
  document.getElementById('st-zoom').textContent = `z ${z.toFixed(1)}`;
  document.getElementById('st-res').textContent = res < 1 ? `${(res*100).toFixed(0)} cm/px` : `${fmt(res,1)} m/px`;
  const vivo = document.getElementById('detalle-vivo');
  if (vivo){
    const b = BASEMAPS.find(x => x.id === state.base);
    const tz = Math.min(Math.round(z+1), b?.maxzoom ?? 19);
    vivo.innerHTML = `<b>Detalle en pantalla</b><br>
      1 px ≈ ${res < 1 ? (res*100).toFixed(0)+' cm' : fmt(res,1)+' m'} en el terreno.<br>
      Teselas servidas a z${tz}${b && Math.round(z+1) > b.maxzoom ? ' (ampliadas: ya no hay mas detalle)' : ''}.<br>
      Analisis del relieve a ${fmt(metersPerPixel(lat, state.anZoom),0)} m por celda.<br>
      ${state.proyeccion === 'mercator'
        ? `A esta latitud Mercator infla el area <b>×${inflacion.toFixed(2)}</b>; las distancias medidas no lo sufren (se calculan sobre la esfera).`
        : 'Proyeccion de areas fieles activa.'}`;
  }
}

function mensaje(txt){
  const m = document.getElementById('st-msg');
  m.textContent = txt;
  clearTimeout(m._t);
  m._t = setTimeout(() => m.textContent = '', 3200);
}

for (const sel of ['#sidebar','#inspector','#profile','#legend']){
  const n = document.querySelector(sel);
  n?.addEventListener('wheel', ev => ev.stopPropagation(), { passive:true });
}

document.querySelectorAll('[data-close]').forEach(b => {
  b.onclick = () => document.getElementById(b.dataset.close).classList.add('hidden');
});

document.getElementById('sidebar-toggle').onclick = () =>
  document.getElementById('app').classList.toggle('collapsed');

const abrirMovil = el('button'); abrirMovil.id = 'mobile-open'; abrirMovil.textContent = '☰';
abrirMovil.onclick = () => document.getElementById('app').classList.toggle('collapsed');
document.getElementById('stage').appendChild(abrirMovil);

addEventListener('keydown', ev => {
  if (ev.target.matches('input,select,textarea')) return;
  const k = ev.key.toLowerCase();
  if (k === 'i') setHerramienta('inspect');
  else if (k === 'p') setHerramienta('profile');
  else if (k === '3'){ state.terrain = !state.terrain; aplicarTerreno(); construirPanel(); guardarEstado(); }
  else if (k === 'c'){ state.curvas = !state.curvas; aplicarCurvas(); construirPanel(); guardarEstado(); }
  else if (k === 'h'){ state.hillshade = !state.hillshade; aplicarSombreado(); construirPanel(); guardarEstado(); }
  else if (k === 'l'){ state.labels = !state.labels; aplicarEtiquetas(); construirPanel(); guardarEstado(); }
  else if (k === 'v') abrirProyeccion();
  else if (k === 's') document.getElementById('app').classList.toggle('collapsed');
  else if (ev.key === 'Escape'){
    $inspector.classList.add('hidden'); $profile.classList.add('hidden');
    document.getElementById('proyeccion').classList.add('hidden');
    if (state.herramienta === 'profile') setHerramienta('inspect');
  }
});

// ---------------------------------------------------------------- busqueda
const $q = document.getElementById('search-input');
const $res = document.getElementById('search-results');
let qTimer;
$q.oninput = () => {
  clearTimeout(qTimer);
  const q = $q.value.trim();
  if (q.length < 3){ $res.classList.add('hidden'); return; }
  qTimer = setTimeout(async () => {
    try{
      const r = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=es&q='
        + encodeURIComponent(q));
      const js = await r.json();
      $res.innerHTML = js.map((f,i) =>
        `<li data-i="${i}">${f.name || f.display_name.split(',')[0]}<small>${f.display_name}</small></li>`).join('');
      $res.classList.toggle('hidden', !js.length);
      $res.querySelectorAll('li').forEach(li => {
        li.onclick = () => {
          const f = js[+li.dataset.i];
          map.flyTo({ center:[+f.lon, +f.lat], zoom:12, duration:1600 });
          $res.classList.add('hidden'); $q.value = f.name || '';
        };
      });
    } catch { $res.classList.add('hidden'); }
  }, 350);
};
document.addEventListener('click', ev => {
  if (!ev.target.closest('.search')) $res.classList.add('hidden');
});

initAccordions(document);

// ---------------------------------------------------------------- PWA
let promptInstalar = null;
function pintarInstalar(){
  const h = document.getElementById('sec-tools');
  if (!promptInstalar || !h || document.getElementById('btn-instalar')) return;
  const b = button(h, { label:'Instalar como aplicacion', onClick:async () => {
    promptInstalar?.prompt();
    const r = await promptInstalar?.userChoice;
    if (r?.outcome === 'accepted'){ b.remove(); promptInstalar = null; }
  }});
  b.id = 'btn-instalar';
  b.style.marginTop = '6px';
}
addEventListener('beforeinstallprompt', ev => { ev.preventDefault(); promptInstalar = ev; pintarInstalar(); });

if ('serviceWorker' in navigator){
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

async function usoCache(){
  if (!navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  return e.usage;
}

// Diagnostico rapido desde la consola.
window.atlas = { map, state, cacheStats, refrescarTodo, usoCache };
