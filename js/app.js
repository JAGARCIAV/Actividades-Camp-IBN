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
 * posición {x,y} en % sobre el camino, avanzando por su longitud real
 * para que el recorrido se sienta natural sobre las curvas del mapa.
 */
function posicionEnCamino(progreso) {
  const t = Math.min(Math.max(progreso, 0), 1);
  let distancia = t * CAMINO.largoTotal;

  for (const seg of CAMINO.segmentos) {
    if (distancia <= seg.largo || seg === CAMINO.segmentos[CAMINO.segmentos.length - 1]) {
      const f = seg.largo === 0 ? 0 : distancia / seg.largo;
      return {
        x: seg.desde.x + (seg.hasta.x - seg.desde.x) * f,
        y: seg.desde.y + (seg.hasta.y - seg.desde.y) * f,
      };
    }
    distancia -= seg.largo;
  }
  return PATH_POINTS[PATH_POINTS.length - 1];
}

/** Pequeño desplazamiento horizontal determinístico para que dos participantes
 *  con puntajes muy parecidos no queden exactamente encimados. */
function jitterHorizontal(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) % 1000;
  return ((hash % 7) - 3) * 1.1; // entre -3.3% y +3.3%
}

/** Calcula la posición final {x,y} en % para un participante según sus puntos. */
function posicionParaParticipante(participante) {
  const progreso = participante.puntos / CONFIG.META_PUNTOS;
  const base = posicionEnCamino(progreso);
  const x = Math.min(Math.max(base.x + jitterHorizontal(participante.id), 8), 92);
  return { x, y: base.y };
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

async function renderActividad() {
  const actividad = await DataService.getActividad();
  document.getElementById('actividadNombre').textContent = actividad.nombre;
  document.getElementById('actividadPuntos').textContent = `Vale ${actividad.puntos} puntos`;
}

/* --------------------------------------------------------------------
 * 4) RENDER: MAPA CON PARTICIPANTES
 * ------------------------------------------------------------------ */

// Recuerda el último puntaje pintado de cada participante para detectar
// aumentos y disparar la animación de "boost" al llegar a su nueva posición.
const ultimosPuntos = new Map();

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

  participantes.forEach((participante) => {
    const pos = posicionParaParticipante(participante);
    let el = capa.querySelector(`.avatar-participante[data-id="${participante.id}"]`);
    const subioPuntos =
      ultimosPuntos.has(participante.id) && participante.puntos > ultimosPuntos.get(participante.id);

    if (!el) {
      el = document.createElement('div');
      el.className = 'avatar-participante';
      el.dataset.id = participante.id;

      const wrap = document.createElement('div');
      wrap.className = 'avatar-foto-wrap';
      wrap.style.setProperty('--avatar-color', participante.color);
      wrap.dataset.foto = participante.foto || '';
      wrap.appendChild(crearFotoElemento(participante, 'avatar-foto', 'avatar-iniciales'));

      const nombreSpan = document.createElement('span');
      nombreSpan.className = 'avatar-nombre';
      nombreSpan.textContent = participante.nombre;

      const puntosSpan = document.createElement('span');
      puntosSpan.className = 'avatar-puntos';
      puntosSpan.textContent = `${participante.puntos} pts`;

      el.append(wrap, nombreSpan, puntosSpan);
      capa.appendChild(el);
    } else {
      el.querySelector('.avatar-nombre').textContent = participante.nombre;
      el.querySelector('.avatar-puntos').textContent = `${participante.puntos} pts`;
      const wrap = el.querySelector('.avatar-foto-wrap');
      wrap.style.setProperty('--avatar-color', participante.color);
      if (wrap.dataset.foto !== (participante.foto || '')) {
        wrap.dataset.foto = participante.foto || '';
        wrap.innerHTML = '';
        wrap.appendChild(crearFotoElemento(participante, 'avatar-foto', 'avatar-iniciales'));
      }
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
    nombreDiv.textContent = participante.nombre;
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
}

// Cuando el admin guarda cambios en OTRA pestaña/ventana del mismo navegador,
// localStorage dispara este evento y la vista pública se refresca sola.
// (Al migrar a Firebase, este listener se reemplaza por un onSnapshot()
// y el resto del código de render no cambia.)
window.addEventListener('storage', (evento) => {
  if (evento.key === 'camp2027_data') renderTodo();
});

// Refresca también al volver a la pestaña, por si hubo cambios mientras
// el dispositivo estaba en segundo plano.
window.addEventListener('focus', renderTodo);

document.addEventListener('DOMContentLoaded', iniciar);
