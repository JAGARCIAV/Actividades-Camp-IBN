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
 * Estos 18 puntos se extrajeron analizando los píxeles de la propia
 * imagen (detectando el color del camino y trazando su línea central),
 * no a ojo, así que siguen la curva real de punta a punta: desde el
 * cartel INICIO hasta la entrada de la carpa en CAMPAMENTO.
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
  { x: 53.1, y: 30.1 }, // CAMPAMENTO
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
  const base = participantes.map((participante) => {
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

/**
 * Nombre "corto" para mostrar en público: primer nombre + inicial del
 * último apellido (ej. "Andrea Gómez López" -> "Andrea L."). El nombre
 * completo se sigue guardando tal cual en los datos; esto es solo para
 * la vista pública (mapa y ranking).
 */
function nombreCorto(nombreCompleto) {
  const partes = nombreCompleto.trim().split(/\s+/).filter(Boolean);
  if (partes.length <= 1) return partes[0] || '';
  const nombre = partes[0];
  const inicial = partes[partes.length - 1][0].toUpperCase();
  return `${nombre} ${inicial}.`;
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
  const actividades = await DataService.getActividades();
  actividadesCache = actividades;
  const contenedor = document.getElementById('actividadesContenedor');
  contenedor.innerHTML = '';

  if (actividades.length === 0) {
    const card = document.createElement('div');
    card.className = 'actividad-card';
    const nombre = document.createElement('span');
    nombre.className = 'actividad-card__nombre';
    nombre.textContent = 'No hay actividades por ahora';
    card.appendChild(nombre);
    contenedor.appendChild(card);
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

/**
 * Muestra el cronómetro de CADA actividad (si tiene inicio y/o fin
 * configurados desde el admin). Se llama una vez por segundo para que
 * la cuenta regresiva se vea en vivo.
 */
function actualizarCronometros() {
  actividadesCache.forEach((actividad) => {
    const card = document.querySelector(`.actividad-card[data-id="${actividad.id}"]`);
    if (!card) return;
    const el = card.querySelector('.actividad-card__cronometro');

    if (!actividad.inicio && !actividad.fin) {
      el.style.display = 'none';
      return;
    }

    const ahora = new Date();
    const inicio = actividad.inicio ? new Date(actividad.inicio) : null;
    const fin = actividad.fin ? new Date(actividad.fin) : null;

    el.style.display = 'inline-flex';
    if (inicio && ahora < inicio) {
      el.textContent = `⏳ Empieza en ${formatearDuracion(inicio - ahora)}`;
    } else if (fin && ahora <= fin) {
      el.textContent = `⏳ Termina en ${formatearDuracion(fin - ahora)}`;
    } else if (fin && ahora > fin) {
      el.textContent = '🔒 Actividad finalizada';
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

async function renderMapa() {
  const participantes = await DataService.getParticipantes();
  const capa = document.getElementById('capaParticipantes');

  // Sincroniza elementos existentes en vez de recrear todo el DOM.
  const idsActuales = new Set(participantes.map((p) => p.id));

  // Elimina avatares de participantes que ya no existen.
  capa.querySelectorAll('.avatar-participante').forEach((el) => {
    if (!idsActuales.has(el.dataset.id)) el.remove();
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

      // avatar-contenido envuelve todo lo visual (ícono + nombre + puntos),
      // separado del posicionamiento (que vive en .avatar-participante).
      const contenido = document.createElement('div');
      contenido.className = 'avatar-contenido';

      const holder = document.createElement('div');
      holder.className = 'avatar-pin-holder';

      const pin = document.createElement('div');
      pin.className = 'avatar-pin';
      pin.style.setProperty('--avatar-color', participante.color);

      const fotoWrap = document.createElement('div');
      fotoWrap.className = 'avatar-pin-foto-wrap';
      fotoWrap.dataset.foto = participante.foto || '';
      fotoWrap.appendChild(crearFotoElemento(participante, 'avatar-foto', 'avatar-iniciales'));

      pin.appendChild(fotoWrap);
      holder.appendChild(pin);

      const nombreSpan = document.createElement('span');
      nombreSpan.className = 'avatar-nombre';
      nombreSpan.textContent = obtenerIniciales(participante.nombre);

      const puntosSpan = document.createElement('span');
      puntosSpan.className = 'avatar-puntos';
      puntosSpan.textContent = `${participante.puntos} pts`;

      contenido.append(holder, nombreSpan, puntosSpan);
      el.appendChild(contenido);
      capa.appendChild(el);
    } else {
      el.querySelector('.avatar-nombre').textContent = obtenerIniciales(participante.nombre);
      el.querySelector('.avatar-puntos').textContent = `${participante.puntos} pts`;
      el.querySelector('.avatar-pin').style.setProperty('--avatar-color', participante.color);
      const fotoWrap = el.querySelector('.avatar-pin-foto-wrap');
      if (fotoWrap.dataset.foto !== (participante.foto || '')) {
        fotoWrap.dataset.foto = participante.foto || '';
        fotoWrap.innerHTML = '';
        fotoWrap.appendChild(crearFotoElemento(participante, 'avatar-foto', 'avatar-iniciales'));
      }
    }

    // Si 2 o más participantes coinciden en el mismo punto del camino,
    // su nombre y sus puntos no caben a la vez: en su lugar, cada uno
    // "parpadea" por turnos (nombre + puntos juntos), para que se
    // alcancen a leer todos sin amontonarse.
    const infoRacimo = racimos.get(participante.id);
    const nombreSpan = el.querySelector('.avatar-nombre');
    const puntosSpan = el.querySelector('.avatar-puntos');
    if (infoRacimo && infoRacimo.tamano >= 2) {
      const duracion = infoRacimo.tamano * TIEMPO_PARPADEO_POR_NOMBRE;
      const retraso = `-${infoRacimo.turno * TIEMPO_PARPADEO_POR_NOMBRE}s`;

      [nombreSpan, puntosSpan].forEach((elemento) => {
        elemento.style.animationDuration = `${duracion}s`;
        elemento.style.animationDelay = retraso;
      });
      nombreSpan.classList.add('avatar-nombre--parpadeo');
      puntosSpan.classList.add('avatar-puntos--parpadeo');
    } else {
      [nombreSpan, puntosSpan].forEach((elemento) => {
        elemento.style.animationDuration = '';
        elemento.style.animationDelay = '';
      });
      nombreSpan.classList.remove('avatar-nombre--parpadeo');
      puntosSpan.classList.remove('avatar-puntos--parpadeo');
    }

    // Al llegar a la meta (CONFIG.META_PUNTOS), el pin se marca como
    // "ganador" con un brillo dorado y un trofeo.
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
    nombreDiv.textContent = nombreCorto(participante.nombre);
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
