// Rampas de color compartidas entre el worker de analisis y las leyendas de la UI.

export function hex(c){
  const n = parseInt(c.slice(1),16);
  return [(n>>16)&255,(n>>8)&255,n&255];
}

// Interpolacion lineal sobre una lista [valor, "#rrggbb"] ordenada.
export function rampLookup(stops, v){
  if (v <= stops[0][0]) return stops[0].rgb;
  const last = stops[stops.length-1];
  if (v >= last[0]) return last.rgb;
  for (let i=1;i<stops.length;i++){
    if (v <= stops[i][0]){
      const a = stops[i-1], b = stops[i];
      const t = (v - a[0]) / (b[0] - a[0]);
      return [
        a.rgb[0] + (b.rgb[0]-a.rgb[0])*t,
        a.rgb[1] + (b.rgb[1]-a.rgb[1])*t,
        a.rgb[2] + (b.rgb[2]-a.rgb[2])*t,
      ];
    }
  }
  return last.rgb;
}

function build(stops){
  return stops.map(([v,c]) => { const s=[v,c]; s.rgb = hex(c); return s; });
}

// Hipsometrica clasica adaptada al rango mexicano (0 - 5,636 m, Pico de Orizaba).
export const HYPSO = build([
  [-500,'#12384f'], [-1,'#1c5b78'],
  [0,'#1f7a4d'], [200,'#4c9a4f'], [500,'#86b354'],
  [900,'#cfc86a'], [1400,'#dcb266'], [2000,'#c8904f'],
  [2700,'#ab6f45'], [3400,'#8f5e4f'], [4000,'#9e8d8b'],
  [4600,'#c9c4c6'], [5200,'#ebebee'], [5700,'#ffffff'],
]);

// Pendiente en grados.
export const SLOPE = build([
  [0,'#1a9850'], [2,'#66bd63'], [5,'#a6d96a'], [10,'#d9ef8b'],
  [15,'#fee08b'], [25,'#fdae61'], [35,'#f46d43'], [45,'#d73027'], [60,'#7f0f2b'],
]);

export const SLOPE_CLASSES = [
  [0,2,'#1a9850','Plano / casi plano'],
  [2,5,'#a6d96a','Suave — cultivo mecanizado'],
  [5,10,'#d9ef8b','Moderado'],
  [10,15,'#fee08b','Moderado fuerte'],
  [15,25,'#fdae61','Fuerte — erosion alta'],
  [25,35,'#f46d43','Escarpado'],
  [35,45,'#d73027','Muy escarpado'],
  [45,90,'#7f0f2b','Acantilado'],
];

// Rugosidad del terreno (TRI de Riley, en metros).
export const TRI = build([
  [0,'#08131f'], [2,'#153c5a'], [6,'#1d6b86'], [15,'#37a07a'],
  [30,'#a9c94f'], [60,'#f0c453'], [120,'#f2704a'], [240,'#ffe9c9'],
]);

// Indice de posicion topografica: valles (azul) - laderas (gris) - crestas (naranja).
export const TPI = build([
  [-60,'#1c4f7c'], [-20,'#4e8fc0'], [-5,'#9ec6e0'],
  [0,'#e8e8e8'], [5,'#f2c08a'], [20,'#d97b3e'], [60,'#8c3a12'],
]);

export const ASPECT_CLASSES = [
  ['N','#e35b4c',337.5,22.5],  ['NE','#e8924a',22.5,67.5],
  ['E','#e8cf4a',67.5,112.5],  ['SE','#a9d15a',112.5,157.5],
  ['S','#45c2a4',157.5,202.5], ['SO','#4aa8d1',202.5,247.5],
  ['O','#5f7fd6',247.5,292.5], ['NO','#a86bd1',292.5,337.5],
];

// Color continuo de orientacion: rueda HSV anclada al norte en rojo.
export function aspectColor(deg){
  const h = ((deg % 360) + 360) % 360 / 360;
  const s = 0.46, v = 0.93;
  const i = Math.floor(h*6), f = h*6 - i;
  const p = v*(1-s), q = v*(1-f*s), t = v*(1-(1-f)*s);
  let r,g,b;
  switch(i%6){
    case 0: r=v;g=t;b=p;break; case 1: r=q;g=v;b=p;break;
    case 2: r=p;g=v;b=t;break; case 3: r=p;g=q;b=v;break;
    case 4: r=t;g=p;b=v;break; default: r=v;g=p;b=q;
  }
  return [r*255,g*255,b*255];
}

export const RAMPS = { hypso:HYPSO, slope:SLOPE, tri:TRI, tpi:TPI };
