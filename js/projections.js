// Proyecciones cartograficas para la vista de visualizacion (no para el analisis).
// Todo sobre esfera unitaria, radianes; la escala la pone el lienzo.

const RAD = Math.PI/180, DEG = 180/Math.PI;
const HALF_PI = Math.PI/2;

// ---------- Equal Earth (Savric, Patterson & Jenny, 2018) ----------
const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796;
const M = Math.sqrt(3)/2;

function eeY(t){ return t*(A1 + A2*t*t + t**6*(A3 + A4*t*t)); }
function eeDY(t){ return A1 + 3*A2*t*t + t**6*(7*A3 + 9*A4*t*t); }

const equalEarth = {
  forward(lon, lat){
    const l = lon*RAD, p = lat*RAD;
    const t = Math.asin(M * Math.sin(p));
    return [ l * Math.cos(t) / (M * eeDY(t)), eeY(t) ];
  },
  inverse(x, y){
    let t = y;                                   // Newton-Raphson, converge en 3-4 pasos
    for (let i=0;i<12;i++){
      const d = (eeY(t) - y) / eeDY(t);
      t -= d;
      if (Math.abs(d) < 1e-12) break;
    }
    const s = Math.sin(t) / M;
    if (Math.abs(s) > 1) return null;
    const lon = x * M * eeDY(t) / Math.cos(t);
    if (Math.abs(lon) > Math.PI + 1e-9) return null;
    return [ lon*DEG, Math.asin(s)*DEG ];
  },
};

// ---------- Mollweide ----------
const mollweide = {
  forward(lon, lat){
    const l = lon*RAD, p = lat*RAD;
    let t = p;
    if (Math.abs(p) < HALF_PI - 1e-9){
      for (let i=0;i<20;i++){
        const d = (2*t + Math.sin(2*t) - Math.PI*Math.sin(p)) / (2 + 2*Math.cos(2*t));
        t -= d;
        if (Math.abs(d) < 1e-12) break;
      }
    } else t = p > 0 ? HALF_PI : -HALF_PI;
    return [ (2*Math.SQRT2/Math.PI) * l * Math.cos(t), Math.SQRT2 * Math.sin(t) ];
  },
  inverse(x, y){
    const s = y/Math.SQRT2;
    if (Math.abs(s) > 1) return null;
    const t = Math.asin(s);
    const sp = (2*t + Math.sin(2*t))/Math.PI;
    if (Math.abs(sp) > 1) return null;
    const lon = Math.PI*x / (2*Math.SQRT2*Math.cos(t));
    if (Math.abs(lon) > Math.PI + 1e-9) return null;
    return [ lon*DEG, Math.asin(sp)*DEG ];
  },
};

// ---------- Conicas (Albers equiarea y Lambert conforme) ----------
function albers(p1, p2, p0, l0){
  const f1 = p1*RAD, f2 = p2*RAD, f0 = p0*RAD, lam0 = l0*RAD;
  const n = (Math.sin(f1) + Math.sin(f2))/2;
  const C = Math.cos(f1)**2 + 2*n*Math.sin(f1);
  const rho = f => Math.sqrt(Math.max(0, C - 2*n*Math.sin(f)))/n;
  const rho0 = rho(f0);
  return {
    forward(lon, lat){
      const r = rho(lat*RAD), th = n*(lon*RAD - lam0);
      return [ r*Math.sin(th), rho0 - r*Math.cos(th) ];
    },
    inverse(x, y){
      const dy = rho0 - y;
      const r = Math.sign(n) * Math.hypot(x, dy);
      const th = Math.atan2(n > 0 ? x : -x, n > 0 ? dy : -dy);
      const s = (C - r*r*n*n)/(2*n);
      if (Math.abs(s) > 1) return null;
      const lon = (lam0 + th/n)*DEG;
      if (Math.abs(lon - l0) > 180) return null;
      return [ lon, Math.asin(s)*DEG ];
    },
  };
}

function lambertCC(p1, p2, p0, l0){
  const f1 = p1*RAD, f2 = p2*RAD, f0 = p0*RAD, lam0 = l0*RAD;
  const tn = f => Math.tan(Math.PI/4 + f/2);
  const n = Math.log(Math.cos(f1)/Math.cos(f2)) / Math.log(tn(f2)/tn(f1));
  const F = Math.cos(f1)*Math.pow(tn(f1), n)/n;
  const rho = f => Math.abs(f) >= HALF_PI - 1e-9 ? (f*n > 0 ? 0 : 1e6) : F/Math.pow(tn(f), n);
  const rho0 = rho(f0);
  return {
    forward(lon, lat){
      const r = rho(lat*RAD), th = n*(lon*RAD - lam0);
      return [ r*Math.sin(th), rho0 - r*Math.cos(th) ];
    },
    inverse(x, y){
      const dy = rho0 - y;
      const r = Math.sign(n) * Math.hypot(x, dy);
      if (r === 0) return null;
      const th = Math.atan2(n > 0 ? x : -x, n > 0 ? dy : -dy)/n;
      const lat = (2*Math.atan(Math.pow(F/r, 1/n)) - HALF_PI)*DEG;
      const lon = (lam0 + th)*DEG;
      if (!Number.isFinite(lat) || Math.abs(lat) > 89.9) return null;
      if (Math.abs(lon - l0) > 180) return null;
      return [ lon, lat ];
    },
  };
}

// ---------- Mercator, para comparar ----------
const mercator = {
  forward(lon, lat){
    const p = Math.max(-85.0511, Math.min(85.0511, lat))*RAD;
    return [ lon*RAD, Math.log(Math.tan(Math.PI/4 + p/2)) ];
  },
  inverse(x, y){
    const lon = x*DEG;
    if (Math.abs(lon) > 180 + 1e-9) return null;
    return [ lon, (2*Math.atan(Math.exp(y)) - HALF_PI)*DEG ];
  },
};

export const PROYECCIONES = [
  { id:'equal-earth', nombre:'Equal Earth', propiedad:'Areas iguales',
    ambito:'mundo', proj:equalEarth,
    nota:'Cada km² del mapa vale lo mismo en cualquier latitud. Las formas se estiran '
       + 'un poco cerca de los bordes, a cambio de que ningun continente se agrande.' },
  { id:'mollweide', nombre:'Mollweide', propiedad:'Areas iguales',
    ambito:'mundo', proj:mollweide,
    nota:'Equivalente clasica de 1805, en elipse. Deforma mas las formas en los bordes '
       + 'que Equal Earth, pero muestra los polos como puntos.' },
  { id:'albers-mx', nombre:'Albers México', propiedad:'Areas iguales',
    ambito:'pais', proj:albers(17.5, 29.5, 23, -102),
    nota:'Conica equiarea con paralelos estandar en 17.5° y 29.5° N. Es la proyeccion '
       + 'correcta para comparar superficies o hacer coropletas de Mexico.' },
  { id:'lambert-mx', nombre:'Lambert cónica (INEGI)', propiedad:'Conforme (angulos)',
    ambito:'pais', proj:lambertCC(17.5, 29.5, 12, -102),
    nota:'La Conica Conforme de Lambert que usa el INEGI en su cartografia oficial. '
       + 'Conserva formas y angulos; las areas ya no son fieles.' },
  { id:'mercator', nombre:'Web Mercator', propiedad:'Conforme (angulos)',
    ambito:'mundo', proj:mercator,
    nota:'La del mapa interactivo, para comparar: fiel en angulos, infla las areas '
       + 'segun 1/cos²(latitud).' },
];

export const AMBITOS = {
  mundo:  { nombre:'Mundo',  bounds:[-180, -60, 180, 84] },
  mexico: { nombre:'México', bounds:[-118.6, 13.9, -85.8, 33.1] },
  na:     { nombre:'Norteamérica', bounds:[-170, 7, -52, 72] },
};

/** Area del circulo geodesico de radio r (m) proyectada: base de las indicatrices. */
export function circuloGeodesico(lon, lat, radioM, n=64){
  const R = 6371008.8;
  const d = radioM/R, pts = [];
  const f1 = lat*RAD, l1 = lon*RAD;
  for (let i=0;i<=n;i++){
    const brg = i/n * 2*Math.PI;
    const f2 = Math.asin(Math.sin(f1)*Math.cos(d) + Math.cos(f1)*Math.sin(d)*Math.cos(brg));
    const l2 = l1 + Math.atan2(Math.sin(brg)*Math.sin(d)*Math.cos(f1), Math.cos(d) - Math.sin(f1)*Math.sin(f2));
    pts.push([l2*DEG, f2*DEG]);
  }
  return pts;
}
