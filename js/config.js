// Catalogo de fuentes. Todas verificadas sin llave de API (sept. 2026).

export const DEM_SOURCES = {
  terrarium: {
    id:'terrarium',
    nombre:'AWS Terrain Tiles (SRTM/NED)',
    url:'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
    encoding:'terrarium',
    maxzoom:15,
    resolucion:'~30 m (1 arcsec)',
    attribution:'DEM: <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank">AWS Terrain Tiles</a> (SRTM, NED, GMTED)',
  },
};

export const BASEMAPS = [
  { id:'esri-sat', nombre:'Satelital Esri', detalle:'Maxar/Airbus · hasta 0.3 m en ciudades', tag:'z19',
    tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    maxzoom:19, attribution:'Imagen: Esri, Maxar, Earthstar Geographics, USDA FSA, USGS, Aerogrid, IGN, IGP' },
  { id:'s2', nombre:'Sentinel-2 sin nubes', detalle:'Mosaico 10 m, 2021 (EOX)', tag:'10 m',
    tiles:['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2021_3857/default/g/{z}/{y}/{x}.jpg'],
    maxzoom:15, attribution:'<a href="https://s2maps.eu" target="_blank">Sentinel-2 cloudless 2021</a> por EOX IT Services (Copernicus)' },
  { id:'gibs-truecolor', nombre:'Color real de hoy', detalle:'VIIRS 250 m, casi tiempo real', tag:'diaria',
    gibs:{ layer:'VIIRS_SNPP_CorrectedReflectance_TrueColor', level:9, format:'jpg' },
    maxzoom:9, attribution:'NASA EOSDIS GIBS / Worldview' },
  { id:'topo', nombre:'Topografico OpenTopoMap', detalle:'Curvas de nivel y senderos', tag:'z17',
    tiles:['https://a.tile.opentopomap.org/{z}/{x}/{y}.png','https://b.tile.opentopomap.org/{z}/{x}/{y}.png'],
    maxzoom:17, attribution:'© <a href="https://opentopomap.org" target="_blank">OpenTopoMap</a> (CC-BY-SA), datos © OpenStreetMap' },
  { id:'esri-topo', nombre:'Topografico Esri', detalle:'Toponimia y curvas', tag:'z19',
    tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}'],
    maxzoom:19, attribution:'Esri, HERE, Garmin, INEGI, USGS' },
  { id:'esri-relief', nombre:'Relieve sombreado Esri', detalle:'Hillshade multi-direccional global', tag:'z16',
    tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}'],
    maxzoom:16, attribution:'Esri, Airbus DS, USGS, NGA, NASA, CGIAR, NCEAS, NLS, OS, NMA, Geodatastyrelsen' },
  { id:'osm', nombre:'OpenStreetMap', detalle:'Referencia de calles y lugares', tag:'z19',
    tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    maxzoom:19, attribution:'© colaboradores de <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>' },
  { id:'dark', nombre:'Base oscura', detalle:'Ideal para superponer analisis', tag:'z16',
    tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'],
    maxzoom:16, attribution:'Esri, HERE, Garmin, © OpenStreetMap, INEGI' },
  { id:'none', nombre:'Sin mapa base', detalle:'Solo las capas de analisis', tag:'—', tiles:null, maxzoom:19, attribution:'' },
];

export const LABELS_LAYER = {
  tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],
  maxzoom:19, attribution:'Esri, HERE, Garmin, INEGI',
};

// Capas ambientales de NASA GIBS (WMTS EPSG:3857, {z}/{y}/{x}).
export const ENV_LAYERS = [
  { id:'none', nombre:'Ninguna' },
  { id:'ndvi', nombre:'Vegetacion NDVI (8 dias)', layer:'MODIS_Terra_NDVI_8Day', level:9, format:'png',
    temporal:true, offset:10, unidad:'NDVI',
    leyenda:{ tipo:'rampa', stops:[['#b26a2a','0.0'],['#e0d08a','0.2'],['#9fbf4a','0.4'],['#4f9a2f','0.6'],['#1c5c12','0.9']],
      sub:'Indice de vegetacion MODIS 250 m. Verde = mas biomasa fotosintetica.' } },
  { id:'evi', nombre:'Vegetacion EVI (8 dias)', layer:'MODIS_Terra_EVI_8Day', level:9, format:'png',
    temporal:true, offset:10, unidad:'EVI',
    leyenda:{ tipo:'rampa', stops:[['#b26a2a','0.0'],['#e0d08a','0.2'],['#9fbf4a','0.4'],['#4f9a2f','0.6'],['#1c5c12','0.9']],
      sub:'EVI corrige el efecto del suelo y la atmosfera en zonas de dosel denso.' } },
  { id:'lst-day', nombre:'Temp. de superficie (dia)', layer:'MODIS_Terra_Land_Surface_Temp_Day', level:7, format:'png',
    temporal:true, offset:2, unidad:'K',
    leyenda:{ tipo:'rampa', stops:[['#3b2f86','-25 °C'],['#3f8fd0','0'],['#6fc08a','15'],['#f2d14a','30'],['#e2542f','45'],['#7c1216','60']],
      sub:'Temperatura radiativa del suelo MODIS 1 km (no es la del aire).' } },
  { id:'lst-night', nombre:'Temp. de superficie (noche)', layer:'MODIS_Terra_Land_Surface_Temp_Night', level:7, format:'png',
    temporal:true, offset:2, unidad:'K',
    leyenda:{ tipo:'rampa', stops:[['#3b2f86','-25 °C'],['#3f8fd0','0'],['#6fc08a','15'],['#f2d14a','30'],['#e2542f','45'],['#7c1216','60']],
      sub:'Util para ver inversiones termicas y heladas en valles.' } },
  { id:'precip', nombre:'Lluvia IMERG (satelital)', layer:'IMERG_Precipitation_Rate', level:6, format:'png',
    temporal:true, offset:2, unidad:'mm/h',
    leyenda:{ tipo:'rampa', stops:[['#1f3b8c','0.1'],['#2f9fd0','1'],['#4fbf6a','3'],['#e8d24a','8'],['#e2542f','15'],['#8c1f6b','30']],
      sub:'Tasa de precipitacion GPM IMERG, ~10 km, cada 30 min.' } },
  { id:'soil', nombre:'Humedad del suelo (SMAP)', layer:'SMAP_L4_Analyzed_Surface_Soil_Moisture', level:6, format:'png',
    temporal:true, offset:6, unidad:'m³/m³',
    leyenda:{ tipo:'rampa', stops:[['#8c6239','seco'],['#d9c08a',''],['#6fc0a8',''],['#2f6fd0','humedo']],
      sub:'Humedad de los primeros 5 cm, modelo SMAP L4 (9 km).' } },
  { id:'sst', nombre:'Temp. del mar (MUR)', layer:'GHRSST_L4_MUR_Sea_Surface_Temperature', level:7, format:'png',
    temporal:true, offset:3, unidad:'°C',
    leyenda:{ tipo:'rampa', stops:[['#3b2f86','0 °C'],['#3f8fd0','10'],['#6fc08a','20'],['#f2d14a','27'],['#e2542f','32']],
      sub:'Clave para huracanes y surgencias del Pacifico y el Golfo.' } },
  { id:'lights', nombre:'Luces nocturnas (VIIRS)', layer:'VIIRS_SNPP_DayNightBand_At_Sensor_Radiance', level:8, format:'png',
    temporal:true, offset:2, unidad:'nW',
    leyenda:{ tipo:'rampa', stops:[['#000000','oscuro'],['#3a3a2a',''],['#c9bd7a',''],['#ffffff','urbano']],
      sub:'Huella humana: ciudades, quemas agricolas y flotas pesqueras.' } },
  { id:'aster', nombre:'Relieve ASTER GDEM', layer:'ASTER_GDEM_Color_Shaded_Relief', level:12, format:'jpeg',
    temporal:false, unidad:'',
    leyenda:{ tipo:'rampa', stops:[['#1f7a4d','bajo'],['#cfc86a',''],['#ab6f45',''],['#ffffff','alto']],
      sub:'Relieve coloreado del ASTER GDEM v3 (30 m), util como referencia rapida.' } },
];

export const GIBS_BASE = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';
export function gibsUrl(layer, level, date, format){
  const t = date ? `${date}` : 'default';
  return `${GIBS_BASE}/${layer}/default/${t}/GoogleMapsCompatible_Level${level}/{z}/{y}/{x}.${format}`;
}

export const ANALYSIS_LAYERS = [
  { id:'none',  nombre:'Ninguno', detalle:'Solo el mapa base' },
  { id:'hypso', nombre:'Altitud (hipsometrica)', detalle:'Pisos altitudinales, 0 a 5,700 m' },
  { id:'slope', nombre:'Pendiente', detalle:'Grados, metodo de Horn 3x3' },
  { id:'aspect',nombre:'Orientacion de ladera', detalle:'Exposicion solar y barlovento' },
  { id:'tri',   nombre:'Rugosidad del terreno', detalle:'TRI de Riley, en metros' },
  { id:'tpi',   nombre:'Posicion topografica', detalle:'Valles, laderas y crestas' },
];

// Sitios de interes geografico en Mexico.
export const PLACES = [
  { n:'Pico de Orizaba', c:[-97.2690,19.0300], z:12.5, p:65, b:-25, d:'5,636 m — el punto mas alto del pais' },
  { n:'Popocatepetl e Izta', c:[-98.6280,19.0800], z:11.5, p:60, b:0, d:'Volcanes activos y glaciares extintos' },
  { n:'Nevado de Toluca', c:[-99.7570,19.1080], z:12.5, p:60, b:20, d:'Caldera con lagunas del Sol y la Luna' },
  { n:'Barrancas del Cobre', c:[-107.8300,27.3000], z:10.5, p:60, b:-15, d:'Cañones mas profundos que el Gran Cañon' },
  { n:'Cañon del Sumidero', c:[-93.0800,16.8500], z:12.5, p:62, b:10, d:'Paredes de 1,000 m sobre el Grijalva' },
  { n:'Sierra San Pedro Martir', c:[-115.4600,31.0400], z:10.5, p:55, b:0, d:'Batolito granitico de Baja California' },
  { n:'Valle de Mexico', c:[-99.1330,19.4326], z:9.5, p:50, b:0, d:'Cuenca endorreica a 2,240 m' },
  { n:'Cuatro Cienegas', c:[-102.0700,26.9200], z:10.5, p:50, b:0, d:'Pozas y sierras plegadas del desierto' },
  { n:'Sierra Gorda', c:[-99.4500,21.1500], z:10, p:55, b:0, d:'Karst y bosque de niebla queretano' },
  { n:'Chichonal y Selva', c:[-93.2280,17.3600], z:11.5, p:58, b:0, d:'Volcan explosivo de 1982' },
  { n:'Volcan de Colima', c:[-103.6170,19.5140], z:12, p:62, b:-10, d:'El estratovolcan mas activo' },
  { n:'Bahia de La Paz', c:[-110.4000,24.2500], z:9.5, p:45, b:0, d:'Costa arida y fondo marino' },
];

export const FUENTES = [
  ['Esri World Imagery','0.3 m (urbano) a 15 m','z19','Composicion Maxar/Airbus + INEGI'],
  ['Sentinel-2 cloudless','10 m','z15','Mosaico anual libre de nubes'],
  ['VIIRS color real','250 m','z9','Actualizado cada dia'],
  ['DEM AWS Terrain','~30 m','z15','SRTM 1" + NED; base de todo el analisis'],
  ['ASTER GDEM v3','30 m','z12','Solo visual, ya coloreado'],
  ['MODIS NDVI/EVI','250 m','z9','Compuesto de 8 dias'],
  ['MODIS LST','1 km','z7','Temperatura de la superficie'],
  ['GPM IMERG','~10 km','z6','Lluvia cada 30 minutos'],
  ['SMAP L4','9 km','z6','Humedad del suelo modelada'],
  ['ERA5 (Open-Meteo)','~9-25 km','puntual','Clima horario desde 1940'],
];
