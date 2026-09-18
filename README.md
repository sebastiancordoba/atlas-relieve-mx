# Atlas de Relieve — México

App web para estudiar **relieve, pendientes, naturaleza y clima** de México con datos
satelitales abiertos. Sin llaves de API, sin backend y sin paso de compilación.

```bash
npm start          # http://localhost:5173
```

Se puede instalar como aplicación (PWA): el navegador ofrece "Instalar", y las teselas
que ya viste quedan en caché para trabajar sin conexión.

---

## ¿Cuánto detalle se puede obtener?

Esta es la pregunta que originó el proyecto. El límite depende de **qué** quieras medir:

| Qué mides | Fuente usada | Resolución real | Zoom útil |
|---|---|---|---|
| Ver el terreno (foto) | Esri World Imagery (Maxar/Airbus) | **0.3–0.6 m** en ciudades, 1–15 m en zonas rurales | z19 |
| Ver vegetación/agua con bandas consistentes | Sentinel-2 sin nubes (EOX, 2021) | **10 m** | z15 |
| Ver hoy | VIIRS color real (NASA GIBS) | 250 m, **actualizado diario** | z9 |
| Altitud, pendiente, orientación | DEM AWS Terrain (SRTM 1" + NED) | **~30 m** | z15 (interpola arriba de z12) |
| Vegetación cuantitativa | MODIS NDVI/EVI, compuesto 8 días | 250 m | z9 |
| Temperatura de superficie | MODIS LST día/noche | 1 km | z7 |
| Lluvia | GPM IMERG, cada 30 min | ~10 km | z6 |
| Humedad del suelo | SMAP L4 | 9 km | z6 |
| Clima puntual (normales) | ERA5 vía Open-Meteo, 1991–2020 | celda de ~9–25 km | puntual |

**El cuello de botella no es la imagen, es el modelo de elevación.** Puedes ver un
coche desde el satélite (0.3 m) pero la pendiente se calcula sobre celdas de 30 m:
un talud de 10 m de ancho simplemente no existe en ese DEM. Por eso la app separa
"detalle visual" de "detalle de análisis" y te muestra ambos en el panel
*Detalle y fuentes*.

### Cómo ir más allá de los 30 m

Para México hay datos mejores, pero se descargan por hoja y no como servicio de teselas:

- **CEM 3.0 del INEGI** — continuo de elevaciones, **15 m**, cubre todo el país.
- **LiDAR del INEGI** — MDT y MDS de **5 m** (y nubes de puntos) en buena parte del
  territorio; es el mejor dato público de relieve mexicano.
- **Copernicus DEM GLO-30 / FABDEM** — 30 m global, mejor tratado que el SRTM crudo.

Una vez que conviertas esos datos a teselas (`gdal2tiles`, `rio-rgbify` o `titiler`),
pégalos en **Detalle y fuentes → DEM personalizado**. La app acepta codificación
`terrarium` o `terrain-RGB` y recalcula pendiente, orientación, rugosidad, curvas de
nivel y perfiles con tu DEM, sin tocar código.

Ejemplo de conversión de un GeoTIFF del CEM a teselas terrain-RGB:

```bash
rio rgbify -b -10000 -i 0.1 cem_v3.tif cem_rgb.tif
gdal2tiles.py --xyz -z 8-15 --profile mercator cem_rgb.tif teselas/
python3 -m http.server 8080 -d teselas   # y usa http://localhost:8080/{z}/{x}/{y}.png
```

---

## Qué hace la app

**Relieve**
- Terreno 3D con exageración ajustable y sombreado con azimut solar configurable.
- Capas calculadas *en el navegador* a partir del DEM, tesela por tesela:
  - **Altitud** (hipsometría con pisos altitudinales).
  - **Pendiente** en grados (método de Horn 3×3), clasificada por uso del suelo.
  - **Orientación de ladera** (exposición solar, barlovento/sotavento).
  - **Rugosidad** (TRI de Riley) para separar llanura, lomerío y escarpe.
  - **Posición topográfica** (TPI): fondos de valle, laderas y parteaguas.
  - **Curvas de nivel** con equidistancia de 20 a 500 m.

**Punto de estudio** (clic en el mapa)
- Altitud, pendiente en grados y %, orientación con rumbo, rugosidad, posición
  topográfica y relieve local en un radio de ~750 m.
- Normales climáticas 1991–2020: climograma, tabla mensual, oscilación anual y
  **clasificación de Köppen-Geiger** calculada con los umbrales de Peel et al. (2007).
- Corrección de temperatura por altitud (6.5 °C/km) cuando el punto está muy por
  encima o debajo de la celda ERA5.

**Perfil topográfico**
- Traza una polilínea y obtén distancia, rango de altitud, desnivel, ascenso y
  descenso acumulados, pendiente media y máxima, con franja de pendiente coloreada.
- El cursor del perfil se sincroniza con un marcador en el mapa.

**Naturaleza y clima (NASA GIBS)**
- NDVI y EVI (8 días), temperatura de superficie día/noche, lluvia IMERG, humedad de
  suelo SMAP, temperatura del mar y luces nocturnas, con selector de fecha.

**Aplicación**
- Instalable (PWA), caché de teselas para campo sin señal, estado persistente,
  URL compartible (`#zoom/lat/lon/bearing/pitch&b=…`), buscador de lugares y
  atajos de teclado: `I` inspeccionar · `P` perfil · `3` terreno 3D · `C` curvas ·
  `H` sombreado · `L` etiquetas · `S` panel · `Esc` cerrar.

---

## Cómo está hecho

Sin dependencias instaladas: MapLibre GL JS viene de CDN y el resto es JavaScript de módulos.

```
index.html              Shell de la app
css/app.css             Tema oscuro cartográfico
js/app.js               Estado, capas, eventos, PWA
js/config.js            Catálogo de fuentes (todas verificadas sin API key)
js/dem.js               Lectura del DEM: caché LRU, malla con borde, consultas puntuales
js/analysis.js          Protocolo analysis:// para MapLibre + pool de workers
js/analysis-worker.js   Morfometría: pendiente, orientación, TRI, TPI, curvas
js/ramps.js             Rampas de color compartidas (worker y leyendas)
js/climate.js           ERA5/Open-Meteo, normales mensuales, Köppen, climograma
js/inspect.js           Panel del punto inspeccionado
js/profile.js           Muestreo y gráfica del perfil
js/ui.js                Widgets y leyendas
sw.js                   Service worker (red primero para el código, caché para teselas)
server.js               Servidor estático mínimo
```

**La idea central**: `maplibregl.addProtocol('analysis', …)` intercepta cada tesela
`analysis://pendiente/{z}/{x}/{y}`, descarga las 9 teselas DEM vecinas, arma una malla
de 272×272 con borde (para que no haya costuras entre teselas), la manda a un worker
que calcula la morfometría y devuelve un PNG. Todo ocurre en el navegador: no hay
servidor de procesamiento.

El análisis se calcula a un zoom fijo (*Detalle*) y se amplía visualmente. Por defecto
z13 (~18 m/celda); z12 es el paso nativo del DEM. Por arriba de eso el resultado se ve
más suave pero **no** contiene más información real.

---

## Notas y límites honestos

- El DEM global es de superficie, no de terreno: en selva y ciudad la elevación
  incluye dosel y edificios.
- ERA5 es un reanálisis de ~9–25 km: en terreno de montaña la temperatura puntual
  puede desviarse varios grados (por eso la corrección por altitud).
- La clasificación de Köppen se calcula con ERA5, no con estaciones del SMN; cerca de
  los umbrales (B/C, w/f) puede diferir de los mapas oficiales.
- Open-Meteo limita las peticiones por minuto; la app cachea por punto y avisa.
- Las capas diarias de GIBS tardan algunas horas en publicarse: si sale vacía,
  retrocede un día.
- Nominatim (buscador) es de uso cortés: no lo llames en bucle.

## Créditos de datos

Esri World Imagery (Maxar, Airbus, USDA, USGS, IGN, INEGI) · Sentinel-2 cloudless por
EOX IT Services (datos Copernicus) · AWS Terrain Tiles (SRTM, NED, GMTED) ·
NASA EOSDIS GIBS / Worldview · OpenTopoMap (CC-BY-SA) · OpenStreetMap ·
ERA5 vía Open-Meteo. Revisa las condiciones de cada servicio antes de un uso comercial.
