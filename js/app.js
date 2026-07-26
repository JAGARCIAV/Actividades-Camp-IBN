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
 * Si en el futuro se reemplaza mapa.png por otra imagen con un camino
 * distinto, solo hay que editar estos puntos.
 * ------------------------------------------------------------------ */
const MAPA_TAMANO = { ancho: 853, alto: 1844 };

const PATH_POINTS = [
  { x: 49, y: 97 }, // INICIO
  { x: 45, y: 88 },
  { x: 54, y: 79 },
  { x: 43, y: 71 },
  { x: 51, y: 63 },
  { x: 39, y: 55 },
  { x: 47, y: 47 },
  { x: 58, y: 40 },
  { x: 48, y: 33 },
  { x: 44, y: 27 }, // CAMPAMENTO
];

/** Puntos necesarios para llegar completamente al campamento (100% del camino). */
const CONFIG = {
  META_PUNTOS: 100,
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
 * Separación (en píxeles) entre avatares que caen en el mismo punto del
 * camino. Se usan dos valores distintos a propósito:
 * - Si son solo 2, se separan lo suficiente para que ambos nombres se
 *   lean sin encimarse (SEPARACION_PAR_PX).
 * - Si son 3 o más, ya no caben todos los nombres uno al lado del otro,
 *   así que se dejan bien juntitos (SEPARACION_MINIMA_PX) y en vez de
 *   pelear por espacio, sus nombres van parpadeando por turnos (ver
 *   CSS: .avatar-nombre--parpadeo).
 */
const SEPARACION_MINIMA_PX = 28;
const SEPARACION_PAR_PX = 84;

/**
 * Calcula la posición final en % de TODOS los participantes a la vez,
 * evitando que se solapen cuando varios tienen puntajes iguales o muy
 * cercanos.
 *
 * Cómo funciona:
 * 1) Cada participante obtiene un punto "ideal" sobre el camino según
 *    su progreso (puntos / META_PUNTOS).
 * 2) Se ordenan por progreso (equivale a ordenarlos por su posición a
 *    lo largo del camino) y se agrupan en "racimos" los que quedan más
 *    cerca que SEPARACION_MINIMA_PX entre sí.
 * 3) Cada racimo se abre en UNA SOLA fila horizontal (perpendicular a
 *    la dirección del camino en ese punto), centrada en el punto ideal
 *    del grupo. Así, sin importar cuántos participantes compartan el
 *    mismo puntaje, quedan parados en línea en ese punto del camino,
 *    nunca uno encima de otro ni uno más adelantado que otro.
 *
 * Devuelve { posiciones, racimos }:
 * - posiciones: Map id -> {x%, y%}
 * - racimos: Map id -> {tamano, indice} (tamano = cuántos comparten ese
 *   punto; indice = su lugar en la fila). Sirve para decidir en el
 *   render si el nombre de ese participante debe parpadear.
 */
function calcularPosicionesSinSolape(participantes) {
  const base = participantes.map((participante) => {
    const progreso = participante.puntos / CONFIG.META_PUNTOS;
    return { participante, progreso, ...puntoYTangenteEnCamino(progreso) };
  });

  // Ordenar por progreso: los que van más cerca en puntos quedan
  // consecutivos, que es justo lo que necesita el agrupador por cercanía.
  base.sort((a, b) => b.progreso - a.progreso);

  const resultados = [];
  const racimos = new Map();

  // Margen de seguridad para que ningún avatar quede tapado por el
  // borde de la imagen o le "corten los pies".
  const MARGEN_BORDE_PX = 18;

  function ubicarRacimo(racimo) {
    const n = racimo.length;
    const anclaX = racimo.reduce((s, p) => s + p.x, 0) / n;
    const anclaY = racimo.reduce((s, p) => s + p.y, 0) / n;
    // Perpendicular al camino en ese punto (para abrir la fila "de lado").
    const { tx, ty } = racimo[0];
    const perpX = -ty;
    const perpY = tx;
    const espaciado = n === 2 ? SEPARACION_PAR_PX : SEPARACION_MINIMA_PX;

    const puntosRacimo = racimo.map((p, i) => {
      const offsetPerp = (i - (n - 1) / 2) * espaciado;
      racimos.set(p.participante.id, { tamano: n, indice: i });
      return {
        id: p.participante.id,
        x: anclaX + perpX * offsetPerp,
        y: anclaY + perpY * offsetPerp,
      };
    });

    // Si la fila completa se acerca al borde de la imagen, se desplaza
    // COMO GRUPO (nunca punto por punto) para no perder la separación
    // que ya se calculó entre sus avatares.
    const minX = Math.min(...puntosRacimo.map((p) => p.x));
    const maxX = Math.max(...puntosRacimo.map((p) => p.x));
    const minY = Math.min(...puntosRacimo.map((p) => p.y));
    const maxY = Math.max(...puntosRacimo.map((p) => p.y));

    let shiftX = 0;
    if (minX < MARGEN_BORDE_PX) shiftX = MARGEN_BORDE_PX - minX;
    else if (maxX > MAPA_TAMANO.ancho - MARGEN_BORDE_PX) shiftX = MAPA_TAMANO.ancho - MARGEN_BORDE_PX - maxX;

    let shiftY = 0;
    if (minY < MARGEN_BORDE_PX) shiftY = MARGEN_BORDE_PX - minY;
    else if (maxY > MAPA_TAMANO.alto - MARGEN_BORDE_PX) shiftY = MAPA_TAMANO.alto - MARGEN_BORDE_PX - maxY;

    puntosRacimo.forEach((p) => resultados.push({ id: p.id, x: p.x + shiftX, y: p.y + shiftY }));
  }

  let racimoActual = [];
  base.forEach((actual) => {
    if (racimoActual.length === 0) {
      racimoActual.push(actual);
      return;
    }
    const anterior = racimoActual[racimoActual.length - 1];
    const distancia = Math.hypot(actual.x - anterior.x, actual.y - anterior.y);
    if (distancia < SEPARACION_MINIMA_PX) {
      racimoActual.push(actual);
    } else {
      ubicarRacimo(racimoActual);
      racimoActual = [actual];
    }
  });
  if (racimoActual.length) ubicarRacimo(racimoActual);

  // Convertir de píxeles a % y devolver un mapa id -> {x%, y%} listo para usar.
  const posiciones = new Map();
  resultados.forEach(({ id, x, y }) => {
    posiciones.set(id, { x: (x / MAPA_TAMANO.ancho) * 100, y: (y / MAPA_TAMANO.alto) * 100 });
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

// Se guarda la última actividad leída para que el cronómetro (que se
// actualiza cada segundo) no tenga que volver a consultar los datos.
let actividadActual = null;

async function renderActividad() {
  const actividad = await DataService.getActividad();
  actividadActual = actividad;
  document.getElementById('actividadNombre').textContent = actividad.nombre;
  document.getElementById('actividadPuntos').textContent = `Vale ${actividad.puntos} puntos`;
  actualizarCronometro();
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
 * Muestra el cronómetro de la actividad actual (si tiene inicio y/o fin
 * configurados desde el admin). Se llama una vez por segundo para que
 * la cuenta regresiva se vea en vivo.
 */
function actualizarCronometro() {
  const el = document.getElementById('actividadCronometro');
  if (!actividadActual || (!actividadActual.inicio && !actividadActual.fin)) {
    el.style.display = 'none';
    return;
  }

  const ahora = new Date();
  const inicio = actividadActual.inicio ? new Date(actividadActual.inicio) : null;
  const fin = actividadActual.fin ? new Date(actividadActual.fin) : null;

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
}

setInterval(actualizarCronometro, 1000);

/* --------------------------------------------------------------------
 * 4) RENDER: MAPA CON PARTICIPANTES
 * ------------------------------------------------------------------ */

// Recuerda el último puntaje pintado de cada participante para detectar
// aumentos y disparar la animación de "boost" al llegar a su nueva posición.
const ultimosPuntos = new Map();

// Cuántos segundos permanece cada nombre "en pantalla" dentro del ciclo
// de parpadeo cuando 3 o más participantes comparten el mismo punto.
const TIEMPO_PARPADEO_POR_NOMBRE = 1.4;

async function renderMapa() {
  const participantes = await DataService.getParticipantes();
  const capa = document.getElementById('capaParticipantes');

  // Sincroniza elementos existentes en vez de recrear todo el DOM,
  // así las transiciones CSS de left/top se animan correctamente.
  const idsActuales = new Set(participantes.map((p) => p.id));

  // Elimina avatares de participantes que ya no existen.
  capa.querySelectorAll('.avatar-participante').forEach((el) => {
    if (!idsActuales.has(el.dataset.id)) el.remove();
  });

  // Se calculan todas las posiciones juntas (no una por una) porque el
  // anti-solape necesita ver el conjunto completo para armar las filas.
  const { posiciones, racimos } = calcularPosicionesSinSolape(participantes);

  participantes.forEach((participante) => {
    const pos = posiciones.get(participante.id);
    let el = capa.querySelector(`.avatar-participante[data-id="${participante.id}"]`);
    const subioPuntos =
      ultimosPuntos.has(participante.id) && participante.puntos > ultimosPuntos.get(participante.id);

    if (!el) {
      el = document.createElement('div');
      el.className = 'avatar-participante';
      el.dataset.id = participante.id;

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
      nombreSpan.textContent = nombreCorto(participante.nombre);

      const puntosSpan = document.createElement('span');
      puntosSpan.className = 'avatar-puntos';
      puntosSpan.textContent = `${participante.puntos} pts`;

      el.append(holder, nombreSpan, puntosSpan);
      capa.appendChild(el);
    } else {
      el.querySelector('.avatar-nombre').textContent = nombreCorto(participante.nombre);
      el.querySelector('.avatar-puntos').textContent = `${participante.puntos} pts`;
      el.querySelector('.avatar-pin').style.setProperty('--avatar-color', participante.color);
      const fotoWrap = el.querySelector('.avatar-pin-foto-wrap');
      if (fotoWrap.dataset.foto !== (participante.foto || '')) {
        fotoWrap.dataset.foto = participante.foto || '';
        fotoWrap.innerHTML = '';
        fotoWrap.appendChild(crearFotoElemento(participante, 'avatar-foto', 'avatar-iniciales'));
      }
    }

    // Si 3 o más participantes coinciden en el mismo punto del camino,
    // sus nombres no caben uno al lado del otro: en vez de eso, cada
    // uno "parpadea" (aparece por turnos) para que se alcancen a leer
    // todos sin amontonarse.
    const infoRacimo = racimos.get(participante.id);
    const nombreSpan = el.querySelector('.avatar-nombre');
    if (infoRacimo && infoRacimo.tamano >= 3) {
      const duracion = infoRacimo.tamano * TIEMPO_PARPADEO_POR_NOMBRE;
      nombreSpan.classList.add('avatar-nombre--parpadeo');
      nombreSpan.style.animationDuration = `${duracion}s`;
      nombreSpan.style.animationDelay = `-${infoRacimo.indice * TIEMPO_PARPADEO_POR_NOMBRE}s`;
    } else {
      nombreSpan.classList.remove('avatar-nombre--parpadeo');
      nombreSpan.style.animationDuration = '';
      nombreSpan.style.animationDelay = '';
    }

    el.style.left = `${pos.x}%`;
    el.style.top = `${pos.y}%`;

    if (subioPuntos) {
      el.classList.remove('avatar-boost');
      void el.offsetWidth; // fuerza reinicio de animación
      el.classList.add('avatar-boost');
    }

    ultimosPuntos.set(participante.id, participante.puntos);
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
    const li = document.createElement('li');
    li.className = `ranking-item${posicion <= 3 ? ` ranking-item--${posicion}` : ''}`;

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
    puntosSpan.textContent = `${participante.puntos} pts`;

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
  await Promise.all([renderActividad(), renderMapa(), renderRanking()]);
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
