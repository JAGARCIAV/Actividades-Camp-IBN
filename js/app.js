/**
 * app.js
 * ------------------------------------------------------------------
 * Lógica de la PÁGINA PÚBLICA (index.html).
 * Solo lectura: muestra el mapa, la actividad actual y el ranking.
 * Ningún control de aquí modifica datos: eso vive en admin.js.
 * ------------------------------------------------------------------
 */

/* --------------------------------------------------------------------
 * 1) CAMINO SOBRE EL MAPA
 * ------------------------------------------------------------------
 * assets/mapa.png mide 853 x 1844 px y dibuja un camino serpenteante
 * que va desde el cartel "INICIO" (abajo) hasta "CAMPAMENTO" (arriba).
 *
 * PATH_POINTS traza ese camino como una serie de puntos en PORCENTAJE
 * (x%, y%) relativos al tamaño de la imagen, en el orden INICIO -> CAMPAMENTO.
 * Como están en porcentaje, funcionan en cualquier tamaño de pantalla
 * sin tocar la imagen ni recalcular nada a mano.
 *
 * La mayoría de estos 18 puntos se extrajeron analizando los píxeles
 * de la propia imagen (detectando el color del camino y trazando su
 * línea central), no a ojo, así que siguen la curva real de punta a
 * punta. El último (CAMPAMENTO) es la excepción a propósito: en vez de
 * quedar al pie de la carpa, apunta a la tarima de madera de arriba,
 * que es donde tienen que terminar parados quienes llegan a la meta.
 * Ojo: como la etiqueta (nombre+puntos) va DEBAJO del personaje dentro
 * de .avatar-contenido y todo el bloque se ancla por su borde inferior
 * (ver "translate(-50%, -100%)" en .avatar-participante), los pies
 * quedan visualmente más arriba que este y%: hay que dejar ese margen
 * de más hacia abajo, si no el personaje "flota" sobre la baranda.
 *
 * Si en el futuro se reemplaza mapa.png por otra imagen con un camino
 * distinto, solo hay que editar estos puntos.
 * ------------------------------------------------------------------ */
const MAPA_TAMANO = { ancho: 853, alto: 1844 };

const PATH_POINTS = [
  { x: 53.9, y: 99.9 }, // INICIO
  { x: 49.3, y: 94.7 },
  { x: 45.3, y: 89.7 },
  { x: 50.1, y: 84.8 },
  { x: 54.4, y: 80.2 },
  { x: 54.2, y: 75.2 },
  { x: 44.2, y: 71.2 },
  { x: 35.9, y: 66.6 },
  { x: 43.7, y: 62.0 },
  { x: 55.0, y: 58.6 },
  { x: 53.9, y: 54.0 },
  { x: 42.6, y: 50.7 },
  { x: 39.9, y: 45.9 },
  { x: 51.6, y: 42.8 },
  { x: 58.8, y: 39.1 },
  { x: 46.5, y: 36.6 },
  { x: 41.3, y: 33.0 },
  { x: 50.0, y: 22.0 }, // CAMPAMENTO: sobre la tabla de piso de la tarima (no en la baranda ni al pie, junto a la carpa)
];

/** Puntos necesarios para llegar completamente al campamento (100% del camino). */
const CONFIG = {
  META_PUNTOS: 5000,
};

/** Convierte un punto {x,y} en % a coordenadas de píxel reales de la imagen. */
function puntoAPixeles(pt) {
  return { x: (pt.x / 100) * MAPA_TAMANO.ancho, y: (pt.y / 100) * MAPA_TAMANO.alto };
}

/** Construye los segmentos del camino con su longitud real (en píxeles). */
function construirSegmentos() {
  const segmentos = [];
  let largoTotal = 0;
  for (let i = 0; i < PATH_POINTS.length - 1; i++) {
    const a = puntoAPixeles(PATH_POINTS[i]);
    const b = puntoAPixeles(PATH_POINTS[i + 1]);
    const largo = Math.hypot(b.x - a.x, b.y - a.y);
    segmentos.push({ desde: PATH_POINTS[i], hasta: PATH_POINTS[i + 1], largo });
    largoTotal += largo;
  }
  return { segmentos, largoTotal };
}

const CAMINO = construirSegmentos();

/**
 * Dado un progreso de 0 a 1 (0 = inicio, 1 = campamento), calcula la
 * posición en PÍXELES reales sobre el camino, junto con la tangente
 * (dirección en la que se avanza en ese punto). La tangente sirve para
 * poder abrir en abanico a los participantes perpendicularmente al
 * camino cuando varios coinciden en el mismo lugar (ver más abajo).
 */
function puntoYTangenteEnCamino(progreso) {
  const t = Math.min(Math.max(progreso, 0), 1);
  let distancia = t * CAMINO.largoTotal;

  for (const seg of CAMINO.segmentos) {
    const esUltimo = seg === CAMINO.segmentos[CAMINO.segmentos.length - 1];
    if (distancia <= seg.largo || esUltimo) {
      const f = seg.largo === 0 ? 0 : distancia / seg.largo;
      const desdePx = puntoAPixeles(seg.desde);
      const hastaPx = puntoAPixeles(seg.hasta);
      const dx = hastaPx.x - desdePx.x;
      const dy = hastaPx.y - desdePx.y;
      const largo = Math.hypot(dx, dy) || 1;
      return {
        x: desdePx.x + dx * f,
        y: desdePx.y + dy * f,
        tx: dx / largo,
        ty: dy / largo,
      };
    }
    distancia -= seg.largo;
  }
  const ultimo = puntoAPixeles(PATH_POINTS[PATH_POINTS.length - 1]);
  return { x: ultimo.x, y: ultimo.y, tx: 0, ty: -1 };
}

/**
 * Hash determinístico de un texto, con una mezcla final ("avalancha")
 * para que ids parecidos entre sí (como "p1", "p2", "p3"...) no queden
 * en el mismo orden secuencial al ordenar por este hash.
 */
function hashTexto(texto) {
  let hash = 5381;
  for (let i = 0; i < texto.length; i++) {
    hash = ((hash << 5) + hash + texto.charCodeAt(i)) | 0;
  }
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  hash = hash ^ (hash >>> 16);
  return Math.abs(hash);
}

/**
 * CARRILES (lanes): cada participante tiene asignado, desde que se
 * crea (ver js/data.js), un carril fijo de 1 a LANE_COUNT que nunca
 * cambia. Un carril es, ni más ni menos, una copia del camino central
 * desplazada perpendicularmente una cantidad fija de píxeles. Así, la
 * posición de cada quien depende de DOS cosas —su carril y su
 * progreso—, no solo del progreso: dos participantes con el mismo
 * puntaje quedan uno al lado del otro (cada uno en su propio carril),
 * nunca superpuestos.
 *
 * Si hay más participantes que carriles, js/data.js reutiliza números
 * de carril; el pequeño "resolvedor de colisiones" de más abajo cubre
 * ese caso límite (mismo carril reutilizado + puntaje casi idéntico)
 * separándolos un poco más y usando el mismo parpadeo de siempre.
 */
const LANE_COUNT = 12;
const LANE_SEPARACION_PX = 36;

/** Desplazamiento perpendicular (en píxeles) que le toca a un carril. */
function offsetDeLane(lane) {
  const laneValido = ((Math.round(lane) - 1 + LANE_COUNT) % LANE_COUNT) + 1; // siempre 1..12
  return (laneValido - (LANE_COUNT + 1) / 2) * LANE_SEPARACION_PX;
}

// Poner en `true` para volver a ver las líneas de depuración de los
// carriles (verificar que sigan bien el camino); queda apagado para
// que ni el público ni el admin las vean.
const MOSTRAR_CARRILES_DEBUG = false;

// Poner en `true` para volver a ver las 2 líneas rojas verticales que
// marcan el límite del 15%/85% del deambular (para comprobar en vivo
// si algún avatar las cruza). Queda apagado para que no se vean.
const MOSTRAR_MUROS_DEAMBULAR_DEBUG = false;

function aplicarDebugMurosDeambular() {
  const wrapper = document.getElementById('mapaWrapper');
  if (wrapper) wrapper.classList.toggle('mapa-wrapper--debug-muros', MOSTRAR_MUROS_DEAMBULAR_DEBUG);
}

/** Dibuja los 12 carriles como líneas de colores, para verificar que
 *  sigan bien las curvas del camino (no se usa para nada más). */
function dibujarLineasCarriles() {
  const svg = document.getElementById('lineasCarriles');
  if (!svg || !MOSTRAR_CARRILES_DEBUG) return;

  const coloresDebug = [
    '#e63946', '#f3722c', '#f8961e', '#f9c74f', '#90be6d', '#43aa8b',
    '#4d908e', '#577590', '#277da1', '#9d4edd', '#c9184a', '#ff7096',
  ];
  const MUESTRAS = 60;

  for (let lane = 1; lane <= LANE_COUNT; lane++) {
    const puntos = [];
    for (let i = 0; i <= MUESTRAS; i++) {
      const { x, y, tx, ty } = puntoYTangenteEnCamino(i / MUESTRAS);
      const offset = offsetDeLane(lane);
      puntos.push(`${(x - ty * offset).toFixed(1)},${(y + tx * offset).toFixed(1)}`);
    }
    const linea = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    linea.setAttribute('points', puntos.join(' '));
    linea.setAttribute('fill', 'none');
    linea.setAttribute('stroke', coloresDebug[lane - 1]);
    linea.setAttribute('stroke-width', '2');
    linea.setAttribute('stroke-opacity', '0.65');
    svg.appendChild(linea);
  }
}

/**
 * Ancho real del camino de tierra (en píxeles nativos de la imagen,
 * medido desde el centro hacia cada lado) en 41 puntos a lo largo del
 * recorrido. Se extrajo analizando los píxeles de assets/mapa.png
 * (mismo método que PATH_POINTS: detección de color), con un margen de
 * seguridad del 25% ya aplicado para no salirse nunca del camino
 * dibujado. Sirve para que el "deambular" (caminar de lado a lado)
 * use el ancho real disponible en cada punto, en vez de una distancia
 * fija e igual en todos lados.
 */
const ANCHO_CAMINO = [
  { progreso: 0.0, izquierda: 37.5, derecha: 22.5 },
  { progreso: 0.025, izquierda: 37.5, derecha: 22.5 },
  { progreso: 0.05, izquierda: 37.5, derecha: 34.3 },
  { progreso: 0.075, izquierda: 37.5, derecha: 46.1 },
  { progreso: 0.1, izquierda: 37.5, derecha: 57.9 },
  { progreso: 0.125, izquierda: 37.5, derecha: 69.8 },
  { progreso: 0.15, izquierda: 37.5, derecha: 81.6 },
  { progreso: 0.175, izquierda: 37.5, derecha: 93.4 },
  { progreso: 0.2, izquierda: 37.5, derecha: 105.2 },
  { progreso: 0.225, izquierda: 37.5, derecha: 111.9 },
  { progreso: 0.25, izquierda: 52.2, derecha: 109.0 },
  { progreso: 0.275, izquierda: 66.9, derecha: 106.1 },
  { progreso: 0.3, izquierda: 81.6, derecha: 103.2 },
  { progreso: 0.325, izquierda: 85.5, derecha: 100.4 },
  { progreso: 0.35, izquierda: 85.5, derecha: 97.5 },
  { progreso: 0.375, izquierda: 81.8, derecha: 90.0 },
  { progreso: 0.4, izquierda: 81.8, derecha: 82.5 },
  { progreso: 0.425, izquierda: 81.8, derecha: 82.5 },
  { progreso: 0.45, izquierda: 91.0, derecha: 82.5 },
  { progreso: 0.475, izquierda: 100.2, derecha: 93.0 },
  { progreso: 0.5, izquierda: 104.2, derecha: 70.5 },
  { progreso: 0.525, izquierda: 83.2, derecha: 60.0 },
  { progreso: 0.55, izquierda: 67.5, derecha: 58.1 },
  { progreso: 0.575, izquierda: 67.5, derecha: 56.2 },
  { progreso: 0.6, izquierda: 67.5, derecha: 54.4 },
  { progreso: 0.625, izquierda: 51.0, derecha: 52.5 },
  { progreso: 0.65, izquierda: 48.8, derecha: 50.6 },
  { progreso: 0.675, izquierda: 48.8, derecha: 48.8 },
  { progreso: 0.7, izquierda: 48.8, derecha: 48.8 },
  { progreso: 0.725, izquierda: 48.8, derecha: 48.8 },
  { progreso: 0.75, izquierda: 58.5, derecha: 39.8 },
  { progreso: 0.775, izquierda: 39.8, derecha: 30.8 },
  { progreso: 0.8, izquierda: 31.5, derecha: 30.8 },
  { progreso: 0.825, izquierda: 31.5, derecha: 30.8 },
  { progreso: 0.85, izquierda: 25.5, derecha: 26.2 },
  { progreso: 0.875, izquierda: 16.5, derecha: 21.8 },
  { progreso: 0.9, izquierda: 16.5, derecha: 21.8 },
  { progreso: 0.925, izquierda: 16.5, derecha: 20.2 },
  { progreso: 0.95, izquierda: 16.5, derecha: 10.5 },
  { progreso: 0.975, izquierda: 13.5, derecha: 2.2 },
  { progreso: 1.0, izquierda: 13.5, derecha: 2.2 },
];

/** Ancho disponible (px nativos) hacia cada lado del camino, en un progreso dado. */
function anchoDelCaminoEn(progreso) {
  const t = Math.min(Math.max(progreso, 0), 1);
  for (let i = 0; i < ANCHO_CAMINO.length - 1; i++) {
    const a = ANCHO_CAMINO[i];
    const b = ANCHO_CAMINO[i + 1];
    if (t <= b.progreso || i === ANCHO_CAMINO.length - 2) {
      const f = (t - a.progreso) / (b.progreso - a.progreso || 1);
      return {
        izquierda: a.izquierda + (b.izquierda - a.izquierda) * f,
        derecha: a.derecha + (b.derecha - a.derecha) * f,
      };
    }
  }
  return { izquierda: 20, derecha: 20 };
}

/** Factor de escala entre los píxeles nativos de la imagen y los píxeles
 *  reales en pantalla (el mapa se ve más chico o más grande según el
 *  ancho del dispositivo). Se usa para que el deambular se vea del
 *  tamaño correcto sin importar la pantalla. */
function escalaMapaActual() {
  const wrapper = document.getElementById('mapaWrapper');
  if (!wrapper || !wrapper.clientWidth) return 1;
  return wrapper.clientWidth / MAPA_TAMANO.ancho;
}

/**
 * Ritmo de caminata al deambular (tanto parado en el camino como en la
 * meta): píxeles de pantalla por segundo. Antes cada paso duraba un
 * tiempo fijo (900-1600ms) sin importar la distancia — se veía bien
 * con distancias chicas y fijas, pero al hacer que la distancia varíe
 * según el ancho real del camino (a veces mucho más grande), la MISMA
 * duración corta para una distancia más larga se veía como si
 * corriera en vez de caminar. Ahora la duración se calcula a partir de
 * la distancia, para que la velocidad sea siempre la misma.
 */
const VELOCIDAD_DEAMBULAR_PX_SEG = 16;

function duracionParaDistanciaDeambular(distanciaPx) {
  // Sin tope máximo: un tope fijo hacía que, en tramos largos, la
  // duración dejara de crecer con la distancia y la velocidad efectiva
  // aumentara (mismo tiempo, más distancia recorrida). El mínimo sí se
  // mantiene para que los pasos muy cortos no se vean demasiado bruscos.
  const ms = (Math.abs(distanciaPx) / VELOCIDAD_DEAMBULAR_PX_SEG) * 1000;
  return Math.max(500, ms);
}

// Margen de seguridad para que ningún avatar quede tapado por el borde
// de la imagen o le "corten los pies".
const MARGEN_BORDE_PX = 23;

/**
 * Calcula la posición final en % de TODOS los participantes, usando
 * SIEMPRE carril + progreso (nunca solo el progreso).
 *
 * Devuelve { posiciones, racimos }:
 * - posiciones: Map id -> {x%, y%}
 * - racimos: Map id -> {tamano, turno}, solo para quienes de verdad
 *   coincidieron en el mismo punto exacto (carril reutilizado con
 *   puntaje casi idéntico); sirve para el parpadeo, igual que antes.
 */
function calcularPosicionesPorLane(participantes) {
  // Punto exacto de la tarima del campamento (el último de PATH_POINTS).
  const tarimaCampamento = puntoAPixeles(PATH_POINTS[PATH_POINTS.length - 1]);

  const base = participantes.map((participante) => {
    // Quienes ya llegaron a la meta se agrupan sobre la tarima,
    // celebrando juntos. NO se les aplica el desplazamiento de carril:
    // justo en ese último tramo el camino es bastante diagonal, y el
    // carril (pensado para ir "al lado del camino") los terminaba
    // empujando fuera de la imagen, hacia el cielo.
    if (participante.puntos >= CONFIG.META_PUNTOS) {
      const angulo = (hashTexto(participante.id) % 360) * (Math.PI / 180);
      const distancia = 10 + (hashTexto(participante.id + 'd') % 14);
      return {
        participante,
        x: tarimaCampamento.x + Math.cos(angulo) * distancia,
        y: tarimaCampamento.y + Math.sin(angulo) * distancia,
        perpX: 1,
        perpY: 0,
      };
    }

    const progreso = participante.puntos / CONFIG.META_PUNTOS;
    const { x, y, tx, ty } = puntoYTangenteEnCamino(progreso);
    const perpX = -ty;
    const perpY = tx;
    // Todo participante debería tener carril asignado al crearse; este
    // hash es solo un respaldo por si llegara a faltar el dato.
    const lane = participante.lane || (hashTexto(participante.id) % LANE_COUNT) + 1;
    const offset = offsetDeLane(lane);

    return { participante, x: x + perpX * offset, y: y + perpY * offset, perpX, perpY };
  });

  // Agrupar a quienes cayeron prácticamente en el mismo punto exacto.
  // Con carriles únicos (12 participantes o menos) esto casi nunca pasa;
  // es el resguardo para cuando se reutilizan carriles.
  const grupos = new Map();
  base.forEach((item) => {
    const clave = `${Math.round(item.x / 8)}|${Math.round(item.y / 8)}`;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(item);
  });

  const racimos = new Map();
  const NUDGE_PX = 18;

  grupos.forEach((grupo) => {
    if (grupo.length < 2) return;
    // Orden de parpadeo aleatorio (por hash del id), igual que antes.
    const idsPorTurno = grupo.map((it) => it.participante.id).sort((a, b) => hashTexto(a) - hashTexto(b));

    grupo.forEach((item, i) => {
      const offsetExtra = (i - (grupo.length - 1) / 2) * NUDGE_PX;
      item.x += item.perpX * offsetExtra;
      item.y += item.perpY * offsetExtra;
      racimos.set(item.participante.id, { tamano: grupo.length, turno: idsPorTurno.indexOf(item.participante.id) });
    });
  });

  const posiciones = new Map();
  base.forEach((item) => {
    const px = Math.min(Math.max(item.x, MARGEN_BORDE_PX), MAPA_TAMANO.ancho - MARGEN_BORDE_PX);
    const py = Math.min(Math.max(item.y, MARGEN_BORDE_PX), MAPA_TAMANO.alto - MARGEN_BORDE_PX);
    posiciones.set(item.participante.id, { x: (px / MAPA_TAMANO.ancho) * 100, y: (py / MAPA_TAMANO.alto) * 100 });
  });

  return { posiciones, racimos };
}

/* --------------------------------------------------------------------
 * 2) UTILIDADES DE RENDER
 * ------------------------------------------------------------------ */

function obtenerIniciales(nombre) {
  return nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

/** Primer nombre + inicial del primer apellido (ej. "Jose Armando García
 *  Vallejos" -> "Jose G."), para la etiqueta de cada avatar en el mapa.
 *  Asume la convención de nombre(s) + 2 apellidos al final; si el nombre
 *  tiene 1 o 2 palabras, usa lo que haya sin inventar nada. */
function primerNombreYApellido(nombre) {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length <= 1) return partes[0] || '';
  const apellido = partes.length >= 3 ? partes[partes.length - 2] : partes[partes.length - 1];
  return `${partes[0]} ${apellido[0].toUpperCase()}.`;
}

/** Crea el <img>/iniciales de un avatar con fallback si la foto no carga o no existe. */
function crearFotoElemento(participante, claseImg, claseIniciales) {
  function crearIniciales() {
    const span = document.createElement('div');
    span.className = claseIniciales;
    span.textContent = obtenerIniciales(participante.nombre);
    return span;
  }

  if (!participante.foto) return crearIniciales();

  const img = document.createElement('img');
  img.className = claseImg;
  img.src = participante.foto;
  img.alt = participante.nombre;
  img.onerror = () => img.replaceWith(crearIniciales());
  return img;
}

/* --------------------------------------------------------------------
 * 3) RENDER: HEADER (actividad actual)
 * ------------------------------------------------------------------ */

// Se guardan las últimas actividades leídas para que el cronómetro (que
// se actualiza cada segundo) no tenga que volver a consultar los datos.
let actividadesCache = [];

/**
 * Puede haber una o varias actividades activas a la vez (por ejemplo,
 * dos retos corriendo la misma semana). Se dibuja una tarjeta por cada
 * una dentro de #actividadesContenedor.
 */
async function renderActividades() {
  const todas = await DataService.getActividades();
  const ahora = new Date();
  // Las actividades ya finalizadas (fin en el pasado) no se muestran en
  // la pantalla pública: desaparecen solas al llegar su hora límite.
  const actividades = todas.filter((a) => !a.fin || new Date(a.fin) >= ahora);
  actividadesCache = actividades;
  const contenedor = document.getElementById('actividadesContenedor');
  contenedor.innerHTML = '';

  if (actividades.length === 0) {
    actualizarEstadoVacioActividades();
    return;
  }

  actividades.forEach((actividad) => {
    const card = document.createElement('div');
    card.className = 'actividad-card';
    card.dataset.id = actividad.id;

    const fila = document.createElement('div');
    fila.className = 'actividad-card__fila';

    const info = document.createElement('div');
    info.className = 'actividad-card__info';
    const label = document.createElement('span');
    label.className = 'actividad-card__label';
    label.textContent = 'Actividad actual';
    const nombreSpan = document.createElement('span');
    nombreSpan.className = 'actividad-card__nombre';
    nombreSpan.textContent = actividad.nombre;
    info.append(label, nombreSpan);

    const puntosSpan = document.createElement('span');
    puntosSpan.className = 'actividad-card__puntos';
    puntosSpan.textContent = `Vale ${actividad.puntos} puntos`;

    fila.append(info, puntosSpan);

    const cronometro = document.createElement('span');
    cronometro.className = 'actividad-card__cronometro';

    card.append(fila, cronometro);
    contenedor.appendChild(card);
  });

  actualizarCronometros();
}

/** Convierte una cantidad de milisegundos a un texto tipo "2d 4h 15m 32s". */
function formatearDuracion(ms) {
  const totalSeg = Math.max(0, Math.floor(ms / 1000));
  const dias = Math.floor(totalSeg / 86400);
  const horas = Math.floor((totalSeg % 86400) / 3600);
  const min = Math.floor((totalSeg % 3600) / 60);
  const seg = totalSeg % 60;

  const partes = [];
  if (dias) partes.push(`${dias}d`);
  if (dias || horas) partes.push(`${horas}h`);
  if (dias || horas || min) partes.push(`${min}m`);
  if (!dias && !horas) partes.push(`${seg}s`);
  return partes.join(' ');
}

/** Si ya no queda ninguna tarjeta de actividad real, muestra el aviso de "no hay actividades". */
function actualizarEstadoVacioActividades() {
  const contenedor = document.getElementById('actividadesContenedor');
  if (contenedor.querySelector('.actividad-card[data-id]')) return;
  if (contenedor.querySelector('.actividad-card--vacia')) return;

  const card = document.createElement('div');
  card.className = 'actividad-card actividad-card--vacia';
  const nombre = document.createElement('span');
  nombre.className = 'actividad-card__nombre';
  nombre.textContent = 'No hay actividades por ahora';
  card.appendChild(nombre);
  contenedor.appendChild(card);
}

/**
 * Muestra el cronómetro de CADA actividad (si tiene inicio y/o fin
 * configurados desde el admin). Se llama una vez por segundo para que
 * la cuenta regresiva se vea en vivo. En cuanto una actividad cumple
 * su fecha/hora de fin, su tarjeta desaparece sola de la pantalla
 * pública (no hace falta recargar ni que el admin haga nada más).
 */
function actualizarCronometros() {
  actividadesCache.forEach((actividad) => {
    const card = document.querySelector(`.actividad-card[data-id="${actividad.id}"]`);
    if (!card) return;
    const el = card.querySelector('.actividad-card__cronometro');

    const ahora = new Date();
    const inicio = actividad.inicio ? new Date(actividad.inicio) : null;
    const fin = actividad.fin ? new Date(actividad.fin) : null;

    if (fin && ahora > fin) {
      card.remove();
      actualizarEstadoVacioActividades();
      return;
    }

    if (!inicio && !fin) {
      el.style.display = 'none';
      return;
    }

    el.style.display = 'inline-flex';
    if (inicio && ahora < inicio) {
      el.textContent = `⏳ Empieza en ${formatearDuracion(inicio - ahora)}`;
    } else if (fin && ahora <= fin) {
      el.textContent = `⏳ Termina en ${formatearDuracion(fin - ahora)}`;
    } else {
      el.style.display = 'none';
    }
  });
}

setInterval(actualizarCronometros, 1000);

/* --------------------------------------------------------------------
 * 4) RENDER: MAPA CON PARTICIPANTES
 * ------------------------------------------------------------------ */

// Cuántos segundos dura el turno de cada participante dentro del ciclo
// de parpadeo, cuando 2 o más comparten el mismo punto del camino.
const TIEMPO_PARPADEO_POR_NOMBRE = 1;

/** Ruta de la spritesheet compacta según el género y color del participante. */
// Subir este número cada vez que se regeneren los PNG de assets/sprites/
// (mismo nombre de archivo, contenido nuevo): fuerza a los navegadores a
// descargar la versión nueva en vez de usar una copia vieja en caché.
const SPRITE_VERSION = 2;

// Nombre (normalizado: sin tildes, sin mayúsculas, sin espacios de más) del
// único participante que usa la skin especial "ninja" en vez del personaje
// genérico recoloreado. No es una opción del panel de admin: es un
// personaje fijo para esta persona puntual (ver assets/sprites/masculino-ninja.png).
const NOMBRE_SKIN_NINJA = 'jose armando garcia vallejos';

function normalizarNombre(texto) {
  return (texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function esSkinNinja(participante) {
  return normalizarNombre(participante.nombre) === NOMBRE_SKIN_NINJA;
}

function spriteUrl(participante) {
  if (esSkinNinja(participante)) return `assets/sprites/masculino-ninja.png?v=${SPRITE_VERSION}`;
  const genero = participante.genero === 'femenino' ? 'femenino' : 'masculino';
  const color = (participante.color || '#4D96FF').replace('#', '').toLowerCase();
  return `assets/sprites/${genero}-${color}.png?v=${SPRITE_VERSION}`;
}

// Recuerda el último puntaje pintado de cada participante para saber si
// le cambiaron los puntos (y por lo tanto debe "caminar" hacia su nueva
// posición). Guarda también los temporizadores/listeners en curso de
// cada quien (para poder cancelarlos si le vuelven a cambiar los puntos
// antes de que termine, o si se elimina el participante).
const ultimosPuntos = new Map();
const timersCaminata = new Map();
const listenersCaminata = new Map();
const timersDeambular = new Map();
const timersGanador = new Map();

// Cuánto se alejó cada participante de su línea mientras deambula
// libremente (píxeles nativos de la imagen, + = derecha, - = izquierda).
// Se acumula paso a paso (no vuelve a 0 solo) y solo se resetea cuando
// de verdad regresa a su línea (al recibir puntos).
const derivasDeambular = new Map();

/**
 * Se ejecuta cuando de verdad termina la caminata hacia la nueva
 * posición. Está pensada para poder llamarse desde dos lugares (el
 * evento "transitionend" real y un temporizador de respaldo, por si el
 * navegador no llegara a disparar el evento) sin problema si se llama
 * más de una vez.
 */
function terminarCaminata(participante, contenido, sprite) {
  sprite.classList.remove('avatar-sprite--caminando');
  if (participante.puntos >= CONFIG.META_PUNTOS) {
    if (!timersGanador.has(participante.id)) iniciarCicloGanador(participante.id, contenido, sprite);
  } else if (!timersDeambular.has(participante.id)) {
    sprite.classList.add('avatar-sprite--idle');
    setDireccion(sprite, 'abajo');
    iniciarDeambular(participante, contenido, sprite);
  }
}

// Regla de velocidad: cada 1000 puntos que gane (o pierda), tarda 10
// segundos en caminar hasta su nueva posición.
const MS_POR_CADA_1000_PUNTOS = 10000;

const DIRECCIONES = ['arriba', 'izquierda', 'abajo', 'derecha'];

/** Pone al sprite a mirar en una dirección, quitando las otras 3. */
function setDireccion(sprite, direccion) {
  DIRECCIONES.forEach((d) => sprite.classList.toggle(`avatar-sprite--dir-${d}`, d === direccion));
}

/** Cancela cualquier paso de "deambular" pendiente de un participante. */
function detenerDeambular(participanteId) {
  clearTimeout(timersDeambular.get(participanteId));
  timersDeambular.delete(participanteId);
}

/** Cancela el ciclo de "ganador" (celebrar/caminar) de un participante. */
function detenerCicloGanador(participanteId) {
  clearTimeout(timersGanador.get(participanteId));
  timersGanador.delete(participanteId);
}

/**
 * Mientras un participante está parado (no ganó ni le acaban de sumar
 * puntos), de vez en cuando camina unos pasos hacia un lado, como si
 * explorara alrededor de su lugar en el camino. Es un recorrido LIBRE,
 * no un viaje de ida y vuelta: cada paso sale de donde quedó el paso
 * anterior (no siempre desde su línea), así que puede quedar alejado
 * de su línea por un buen rato, deambulando a su aire. Al llegar a
 * cada punto se detiene un momento y "mira" hacia ambos lados antes de
 * decidir el siguiente paso. Solo vuelve a su línea cuando le toca
 * subir/bajar de verdad (ver el manejo de `cambioPuntos` en
 * `renderMapa`), sin importar qué tan lejos haya quedado deambulando.
 * El límite para no salirse es sobre la IMAGEN completa (no sobre el
 * camino de tierra): nunca puede pisar fuera del 70% central del
 * ancho de `assets/mapa.png` (15% de margen fijo a cada lado), sin
 * importar dónde caiga su línea ni cuánto se haya desviado ya.
 * Cada quien tiene su propio ritmo aleatorio, para que no se vean
 * todos moviéndose sincronizados.
 */
function iniciarDeambular(participante, contenido, sprite) {
  const participanteId = participante.id;

  function quedarseQuieto() {
    if (!document.body.contains(contenido)) return; // el avatar ya no existe

    sprite.classList.remove('avatar-sprite--caminando');
    sprite.classList.add('avatar-sprite--idle');

    // Antes de decidir hacia dónde ir, "mira" primero hacia un lado y
    // luego hacia el otro (sin moverse de lugar).
    const primero = Math.random() < 0.5 ? 'izquierda' : 'derecha';
    const segundo = primero === 'izquierda' ? 'derecha' : 'izquierda';
    setDireccion(sprite, primero);

    timersDeambular.set(participanteId, setTimeout(() => {
      if (!document.body.contains(contenido)) return;
      setDireccion(sprite, segundo);

      timersDeambular.set(participanteId, setTimeout(() => {
        if (!document.body.contains(contenido)) return;
        setDireccion(sprite, 'abajo');
        const espera = 2500 + Math.random() * 4500;

        // Quirk exclusivo de la skin "ninja": de vez en cuando, en vez de
        // quedarse solo parado esperando, hace la animación de "buscador"
        // (fila 4 de assets/sprites/masculino-ninja.png) un rato y recién
        // ahí sigue con el siguiente paso del deambular.
        if (esSkinNinja(participante) && Math.random() < 0.35) {
          const DURACION_BUSCANDO = 2200; // 1.1s x 2 vueltas, ver spriteBuscarNinja en css/style.css
          timersDeambular.set(participanteId, setTimeout(() => {
            if (!document.body.contains(contenido)) return;
            sprite.classList.remove('avatar-sprite--idle');
            sprite.classList.add('avatar-sprite--buscando');
            timersDeambular.set(participanteId, setTimeout(() => {
              if (!document.body.contains(contenido)) return;
              sprite.classList.remove('avatar-sprite--buscando');
              sprite.classList.add('avatar-sprite--idle');
              timersDeambular.set(participanteId, setTimeout(paso, Math.max(0, espera - DURACION_BUSCANDO)));
            }, DURACION_BUSCANDO));
          }, 600));
        } else {
          timersDeambular.set(participanteId, setTimeout(paso, espera));
        }
      }, 450 + Math.random() * 350));
    }, 450 + Math.random() * 350));
  }

  function paso() {
    if (!document.body.contains(contenido)) return; // el avatar ya no existe

    // El movimiento del deambular es SIEMPRE horizontal puro en pantalla
    // (izquierda/derecha), nunca diagonal: aunque el camino en ese punto
    // vaya en diagonal, el personaje solo tiene cuadros de perfil
    // izquierdo/derecho, y moverlo en diagonal se veía como si "subiera
    // o bajara de costado" (y desincronizado con hacia dónde mira).
    const progreso = participante.puntos / CONFIG.META_PUNTOS;
    const lane = participante.lane || (hashTexto(participante.id) % LANE_COUNT) + 1;
    const offsetActual = offsetDeLane(lane);

    // Posición X nativa (en la imagen completa) de SU línea: el punto
    // del camino en ese progreso, desplazado por su carril.
    const { x: xCamino, ty } = puntoYTangenteEnCamino(progreso);
    const xLineaNativo = xCamino + -ty * offsetActual;

    // Dónde está parado AHORA en esa misma escala (su línea + lo que
    // ya se haya alejado en pasos anteriores), para calcular el
    // espacio libre desde ahí y no desde su línea.
    const derivaActual = derivasDeambular.get(participanteId) || 0;
    const xActualNativo = xLineaNativo + derivaActual;

    // "Muro" real sobre la IMAGEN completa (no sobre el camino de
    // tierra): nunca puede pisar fuera del 70% central del ancho de
    // assets/mapa.png, sin importar dónde caiga su línea ni cuánto se
    // haya desviado ya en pasos anteriores.
    const limiteIzquierda = MAPA_TAMANO.ancho * 0.15;
    const limiteDerecha = MAPA_TAMANO.ancho * 0.85;
    const espacioIzquierda = Math.max(6, xActualNativo - limiteIzquierda);
    const espacioDerecha = Math.max(6, limiteDerecha - xActualNativo);

    const haciaIzquierda = Math.random() < 0.5;
    const distanciaNativa = 6 + Math.random() * (haciaIzquierda ? espacioIzquierda : espacioDerecha);
    const xDeseadoNativo = Math.min(
      limiteDerecha,
      Math.max(limiteIzquierda, xActualNativo + (haciaIzquierda ? -distanciaNativa : distanciaNativa)),
    );

    const nuevaDeriva = xDeseadoNativo - xLineaNativo;
    derivasDeambular.set(participanteId, nuevaDeriva);

    const dx = nuevaDeriva * escalaMapaActual();
    const distanciaRecorrida = Math.abs(xDeseadoNativo - xActualNativo);
    const duracionPaso = duracionParaDistanciaDeambular(distanciaRecorrida * escalaMapaActual());

    sprite.classList.remove('avatar-sprite--idle');
    sprite.classList.add('avatar-sprite--caminando');
    setDireccion(sprite, haciaIzquierda ? 'izquierda' : 'derecha');

    contenido.style.transition = `transform ${duracionPaso}ms ease-in-out`;
    contenido.style.transform = `translateX(${dx.toFixed(1)}px)`;

    timersDeambular.set(participanteId, setTimeout(quedarseQuieto, duracionPaso));
  }

  timersDeambular.set(participanteId, setTimeout(paso, Math.random() * 6000));
}

/**
 * El participante que ya llegó a la meta nunca se queda "congelado":
 * va alternando para siempre entre festejar/llamar a sus amigos y
 * caminar un poco de lado a lado (una zona chica, ya está en la meta).
 */
function iniciarCicloGanador(participanteId, contenido, sprite) {
  function celebrando() {
    if (!document.body.contains(contenido)) return;
    sprite.classList.remove('avatar-sprite--caminando');
    setDireccion(sprite, 'abajo');
    sprite.classList.add('avatar-sprite--celebrando');
    timersGanador.set(participanteId, setTimeout(caminarUnPoco, 4000 + Math.random() * 3000));
  }

  function caminarUnPoco() {
    if (!document.body.contains(contenido)) return;
    const haciaIzquierda = Math.random() < 0.5;
    const distancia = 12 + Math.random() * 16;
    const dx = (haciaIzquierda ? -1 : 1) * distancia;
    const duracionPaso = duracionParaDistanciaDeambular(dx);

    sprite.classList.remove('avatar-sprite--celebrando');
    sprite.classList.add('avatar-sprite--caminando');
    setDireccion(sprite, haciaIzquierda ? 'izquierda' : 'derecha');

    contenido.style.transition = `transform ${duracionPaso}ms ease-in-out`;
    contenido.style.transform = `translateX(${dx}px)`;

    timersGanador.set(
      participanteId,
      setTimeout(() => {
        if (!document.body.contains(contenido)) return;
        // Igual que al deambular: al volver, se gira hacia el lado
        // contrario para no caminar de moonwalk.
        setDireccion(sprite, haciaIzquierda ? 'derecha' : 'izquierda');
        contenido.style.transition = `transform ${duracionPaso}ms ease-in-out`;
        contenido.style.transform = 'translateX(0px)';
        timersGanador.set(participanteId, setTimeout(celebrando, duracionPaso));
      }, duracionPaso)
    );
  }

  celebrando();
}

async function renderMapa() {
  const participantes = await DataService.getParticipantes();
  const capa = document.getElementById('capaParticipantes');

  // Sincroniza elementos existentes en vez de recrear todo el DOM.
  const idsActuales = new Set(participantes.map((p) => p.id));

  // Elimina avatares de participantes que ya no existen (y sus temporizadores).
  capa.querySelectorAll('.avatar-participante').forEach((el) => {
    if (!idsActuales.has(el.dataset.id)) {
      detenerDeambular(el.dataset.id);
      detenerCicloGanador(el.dataset.id);
      derivasDeambular.delete(el.dataset.id);
      clearTimeout(timersCaminata.get(el.dataset.id));
      timersCaminata.delete(el.dataset.id);
      const listener = listenersCaminata.get(el.dataset.id);
      if (listener) el.removeEventListener('transitionend', listener);
      listenersCaminata.delete(el.dataset.id);
      el.remove();
    }
  });

  // Se calculan todas las posiciones juntas (no una por una) porque el
  // anti-solape necesita ver el conjunto completo para armar las filas.
  const { posiciones, racimos } = calcularPosicionesPorLane(participantes);

  participantes.forEach((participante) => {
    const pos = posiciones.get(participante.id);
    let el = capa.querySelector(`.avatar-participante[data-id="${participante.id}"]`);

    if (!el) {
      el = document.createElement('div');
      el.className = 'avatar-participante';
      el.dataset.id = participante.id;

      // avatar-contenido envuelve todo lo visual (personaje + nombre + puntos),
      // separado del posicionamiento (que vive en .avatar-participante).
      const contenido = document.createElement('div');
      contenido.className = 'avatar-contenido';

      const sprite = document.createElement('div');
      sprite.className = 'avatar-sprite avatar-sprite--idle';
      sprite.classList.toggle('avatar-sprite--skin-ninja', esSkinNinja(participante));
      sprite.style.backgroundImage = `url(${spriteUrl(participante)})`;

      const etiqueta = document.createElement('span');
      etiqueta.className = 'avatar-etiqueta';

      const nombreSpan = document.createElement('span');
      nombreSpan.className = 'avatar-etiqueta__nombre';
      nombreSpan.textContent = primerNombreYApellido(participante.nombre);

      const puntosSpan = document.createElement('span');
      puntosSpan.className = 'avatar-etiqueta__puntos';
      puntosSpan.textContent = participante.puntos;

      etiqueta.append(nombreSpan, puntosSpan);
      contenido.append(sprite, etiqueta);
      el.appendChild(contenido);
      capa.appendChild(el);
    } else {
      el.querySelector('.avatar-etiqueta__nombre').textContent = primerNombreYApellido(participante.nombre);
      el.querySelector('.avatar-etiqueta__puntos').textContent = participante.puntos;
      const sprite = el.querySelector('.avatar-sprite');
      sprite.classList.toggle('avatar-sprite--skin-ninja', esSkinNinja(participante));
      const nuevaUrl = spriteUrl(participante);
      if (!sprite.style.backgroundImage.includes(nuevaUrl)) {
        sprite.style.backgroundImage = `url(${nuevaUrl})`;
      }
    }

    // Estado del personaje:
    // - Recién llegado a la meta: entra al ciclo de ganador (festeja,
    //   camina un poco, se sienta a descansar, y repite sin parar).
    // - "caminando" hacia su nueva posición justo después de que le
    //   cambien los puntos (lento: 1000 puntos = 10 segundos), mirando
    //   hacia el campamento si sube y hacia el inicio si baja, volviendo
    //   antes a su línea si estaba deambulando de lado a lado.
    // - "parado" (con deambular ocasional) el resto del tiempo.
    const contenido = el.querySelector('.avatar-contenido');
    const sprite = el.querySelector('.avatar-sprite');
    const yaGano = participante.puntos >= CONFIG.META_PUNTOS;
    const esPrimeraVez = !ultimosPuntos.has(participante.id);
    const cambioPuntos = esPrimeraVez ? 0 : participante.puntos - ultimosPuntos.get(participante.id);
    ultimosPuntos.set(participante.id, participante.puntos);

    clearTimeout(timersCaminata.get(participante.id));

    if (esPrimeraVez) {
      // Primer dibujo: sin animación de posición ni deambular a medias.
      el.style.transition = '';
      contenido.style.transition = '';
      contenido.style.transform = 'translateX(0px)';
      if (yaGano) {
        sprite.classList.remove('avatar-sprite--idle', 'avatar-sprite--caminando');
        iniciarCicloGanador(participante.id, contenido, sprite);
      } else {
        sprite.classList.add('avatar-sprite--idle');
        setDireccion(sprite, 'abajo');
        iniciarDeambular(participante, contenido, sprite);
      }
    } else if (cambioPuntos !== 0) {
      detenerDeambular(participante.id);
      detenerCicloGanador(participante.id);
      const listenerAnterior = listenersCaminata.get(participante.id);
      if (listenerAnterior) el.removeEventListener('transitionend', listenerAnterior);

      // Si había quedado deambulando lejos de su línea, primero tiene
      // que volver caminando hasta ella (a la misma velocidad de
      // siempre) y RECIÉN DESPUÉS arrancar a subir/bajar por el
      // camino — nunca los dos movimientos a la vez, porque el
      // personaje se vería caminando en diagonal (mirando de frente o
      // de espaldas mientras se desliza de lado).
      const derivaActual = derivasDeambular.get(participante.id) || 0;
      derivasDeambular.delete(participante.id);
      const duracionVuelta = derivaActual === 0 ? 0
        : duracionParaDistanciaDeambular(derivaActual * escalaMapaActual());

      sprite.classList.remove('avatar-sprite--idle', 'avatar-sprite--celebrando');
      sprite.classList.add('avatar-sprite--caminando');

      // Timer local (NO el Map compartido timersDeambular: guardar acá
      // el aviso de "ya volvió a su línea, ahora que mire para el otro
      // lado" dejaba, después de dispararse una vez, una entrada que
      // nunca se borraba — así terminarCaminata() creía que el
      // deambular ya estaba activo y se salteaba por completo el
      // "quedar parado" al llegar, dejando el sprite congelado a mitad
      // de la animación de caminar).
      let timerVueltaLinea = null;
      if (duracionVuelta > 0) {
        setDireccion(sprite, derivaActual > 0 ? 'izquierda' : 'derecha');
        contenido.style.transition = `transform ${duracionVuelta}ms ease-in-out`;
        contenido.style.transform = 'translateX(0px)';
        timerVueltaLinea = setTimeout(() => {
          if (document.body.contains(contenido)) setDireccion(sprite, cambioPuntos > 0 ? 'arriba' : 'abajo');
        }, duracionVuelta);
      } else {
        // Si sube de puntos va hacia el campamento (de espaldas, como
        // corresponde a avanzar); si baja, va hacia el inicio (de frente).
        setDireccion(sprite, cambioPuntos > 0 ? 'arriba' : 'abajo');
      }

      const duracionMs = (Math.abs(cambioPuntos) / 1000) * MS_POR_CADA_1000_PUNTOS;
      // El movimiento por el camino (left/top) espera a que termine la
      // vuelta a la línea (transition-delay), así que aunque la nueva
      // posición se aplique ya mismo más abajo, no empieza a moverse
      // hasta después de `duracionVuelta`.
      el.style.transition =
        `left ${duracionMs}ms linear ${duracionVuelta}ms, top ${duracionMs}ms linear ${duracionVuelta}ms`;

      // Dos formas de detectar que ya llegó, para que nunca se quede
      // caminando en el mismo lugar: el evento real de fin de
      // transición, y un temporizador de respaldo por si el navegador
      // no lo disparara (ambos llaman a la misma función, que es
      // segura de ejecutar más de una vez).
      let yaTermino = false;
      const finalizar = () => {
        if (yaTermino) return;
        yaTermino = true;
        clearTimeout(timerVueltaLinea);
        el.removeEventListener('transitionend', alTerminarTransicion);
        listenersCaminata.delete(participante.id);
        clearTimeout(timersCaminata.get(participante.id));
        timersCaminata.delete(participante.id);
        terminarCaminata(participante, contenido, sprite);
      };
      const alTerminarTransicion = (evento) => {
        if (evento.target === el && evento.propertyName === 'left') finalizar();
      };
      el.addEventListener('transitionend', alTerminarTransicion);
      listenersCaminata.set(participante.id, alTerminarTransicion);
      timersCaminata.set(participante.id, setTimeout(finalizar, duracionVuelta + duracionMs + 500));
    } else if (yaGano && !timersGanador.has(participante.id)) {
      // Ya era ganador y sigue siéndolo, pero por algún motivo su ciclo
      // no está corriendo (ej. se acaba de cargar la página): arrancarlo.
      iniciarCicloGanador(participante.id, contenido, sprite);
    }
    // Si no hubo cambio de puntos y no es la primera vez ni ganador
    // recién iniciado, no se toca nada: el deambular/ciclo en curso
    // sigue solo.

    // Si 2 o más participantes coinciden en el mismo punto del camino,
    // su pastilla (iniciales + puntos) no cabe para todos a la vez: en
    // su lugar, cada uno "parpadea" por turnos, para que se alcancen a
    // leer todos sin amontonarse.
    const infoRacimo = racimos.get(participante.id);
    const etiqueta = el.querySelector('.avatar-etiqueta');
    if (infoRacimo && infoRacimo.tamano >= 2) {
      const duracion = infoRacimo.tamano * TIEMPO_PARPADEO_POR_NOMBRE;
      const retraso = `-${infoRacimo.turno * TIEMPO_PARPADEO_POR_NOMBRE}s`;

      etiqueta.style.animationDuration = `${duracion}s`;
      etiqueta.style.animationDelay = retraso;
      etiqueta.classList.add('avatar-etiqueta--parpadeo');
    } else {
      etiqueta.style.animationDuration = '';
      etiqueta.style.animationDelay = '';
      etiqueta.classList.remove('avatar-etiqueta--parpadeo');
    }

    // Al llegar a la meta (CONFIG.META_PUNTOS), el personaje se marca
    // como "ganador" con un brillo dorado y un trofeo.
    el.classList.toggle('avatar-participante--ganador', participante.puntos >= CONFIG.META_PUNTOS);

    el.style.left = `${pos.x}%`;
    el.style.top = `${pos.y}%`;
  });
}

/* --------------------------------------------------------------------
 * 5) RENDER: RANKING
 * ------------------------------------------------------------------ */

async function renderRanking() {
  const participantes = await DataService.getParticipantes();
  const lista = document.getElementById('rankingLista');
  const vacio = document.getElementById('rankingVacio');

  const ordenados = [...participantes].sort((a, b) => b.puntos - a.puntos);

  if (ordenados.length === 0) {
    lista.innerHTML = '';
    vacio.style.display = 'block';
    return;
  }
  vacio.style.display = 'none';

  lista.innerHTML = '';
  ordenados.forEach((participante, index) => {
    const posicion = index + 1;
    const esGanador = participante.puntos >= CONFIG.META_PUNTOS;
    const li = document.createElement('li');
    li.className = `ranking-item${posicion <= 3 ? ` ranking-item--${posicion}` : ''}${esGanador ? ' ranking-item--ganador' : ''}`;

    const posicionSpan = document.createElement('span');
    posicionSpan.className = 'ranking-posicion';
    posicionSpan.textContent = `${posicion}°`;

    const wrap = document.createElement('div');
    wrap.className = 'ranking-foto-wrap';
    wrap.style.setProperty('--avatar-color', participante.color);
    wrap.appendChild(crearFotoElemento(participante, 'ranking-foto', 'ranking-iniciales'));

    const info = document.createElement('div');
    info.className = 'ranking-info';
    const nombreDiv = document.createElement('div');
    nombreDiv.className = 'ranking-nombre';
    nombreDiv.textContent = participante.nombre;
    info.appendChild(nombreDiv);

    const puntosSpan = document.createElement('span');
    puntosSpan.className = 'ranking-puntos';
    puntosSpan.textContent = esGanador ? `🏆 ${participante.puntos} pts` : `${participante.puntos} pts`;

    li.append(posicionSpan, wrap, info, puntosSpan);
    lista.appendChild(li);
  });
}

/* --------------------------------------------------------------------
 * 6) LOGO (usa assets/logo.png si existe; si no, se ve el badge en CSS)
 * ------------------------------------------------------------------ */

function cargarLogo() {
  const img = document.getElementById('logoImg');
  const prueba = new Image();
  prueba.onload = () => {
    img.src = 'assets/logo.png';
    img.style.display = 'block';
  };
  prueba.onerror = () => {
    /* se mantiene el badge CSS por defecto */
  };
  prueba.src = 'assets/logo.png';
}

/* --------------------------------------------------------------------
 * 7) INICIALIZACIÓN Y ACTUALIZACIÓN EN VIVO
 * ------------------------------------------------------------------ */

async function renderTodo() {
  await Promise.all([renderActividades(), renderMapa(), renderRanking()]);
}

async function iniciar() {
  await DataService.init();
  cargarLogo();
  dibujarLineasCarriles();
  aplicarDebugMurosDeambular();
  await renderTodo();

  // Firestore avisa en tiempo real cuando cambian los datos, sin
  // importar desde qué celular se hizo el cambio (el admin, otro
  // participante viendo la página, etc.), así que la vista pública se
  // actualiza sola para todos.
  DataService.suscribirCambios(renderTodo);
}

// Refresca también al volver a la pestaña, por si hubo cambios mientras
// el dispositivo estaba en segundo plano.
window.addEventListener('focus', renderTodo);

document.addEventListener('DOMContentLoaded', iniciar);
