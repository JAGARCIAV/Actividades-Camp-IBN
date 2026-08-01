/**
 * data.js
 * ------------------------------------------------------------------
 * Capa de acceso a datos (Data Service), sobre Firebase Firestore.
 *
 * Toda la aplicación (app.js, admin.js) habla con los datos SOLO a
 * través de `window.DataService`. Antes esto vivía en LocalStorage
 * (por dispositivo); ahora vive en Firestore, así que todos los
 * celulares ven exactamente los mismos datos en tiempo real.
 *
 * Este archivo se carga como módulo (<script type="module">) porque el
 * SDK de Firebase se importa directo desde su CDN, sin necesidad de
 * npm ni herramientas de build. app.js y admin.js siguen siendo
 * scripts normales: solo usan `window.DataService`, que este módulo
 * deja listo antes de que se dispare "DOMContentLoaded".
 *
 * Estructura de datos en Firestore:
 * - Colección "participantes": un documento por participante
 *   ({ nombre, foto, puntos, color }), con el id del documento = id
 *   del participante.
 * - Colección "actividades": un documento por actividad activa
 *   ({ nombre, puntos, inicio, fin, completados }). Puede haber varias
 *   a la vez (por ejemplo, dos retos corriendo en la misma semana).
 * ------------------------------------------------------------------
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyCZp24Hyou_SJ72AS8CQGl5DbkxGCc1xgg',
  authDomain: 'ctividades-camp-2027.firebaseapp.com',
  projectId: 'ctividades-camp-2027',
  storageBucket: 'ctividades-camp-2027.firebasestorage.app',
  messagingSenderId: '1079049963707',
  appId: '1:1079049963707:web:bc14b7dd6c51cc344f819e',
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

const PARTICIPANTES_COL = 'participantes';
const ACTIVIDADES_COL = 'actividades';
const META_COL = 'meta';
const META_DOC = 'estado';
const SEED_URL = 'data/participantes.json';

// Carriles (lanes) fijos para ubicar a los participantes sobre el mapa
// sin que se superpongan (ver js/app.js). Se asignan UNA sola vez, al
// crear al participante, y nunca cambian.
const LANE_COUNT = 12;

let yaVerificoSemilla = false;
let yaAseguroLanes = false;

/**
 * Elige el carril libre más bajo (1..LANE_COUNT); si ya están todos
 * ocupados, los reutiliza cíclicamente según cuántos participantes hay.
 */
function calcularSiguienteLane(lanesUsados, totalParticipantes) {
  for (let i = 1; i <= LANE_COUNT; i++) {
    if (!lanesUsados.has(i)) return i;
  }
  return (totalParticipantes % LANE_COUNT) + 1;
}

/**
 * Migración: le asigna un carril a cualquier participante que no
 * tenga uno (por ejemplo, los que ya existían antes de este sistema).
 * Se corre una sola vez por sesión; si no hay nadie sin carril, no
 * escribe nada.
 */
async function asegurarLanesAsignados() {
  if (yaAseguroLanes) return;
  yaAseguroLanes = true;

  const participantes = await getParticipantes();
  const sinLane = participantes.filter((p) => !p.lane);
  if (sinLane.length === 0) return;

  const lanesUsados = new Set(participantes.map((p) => p.lane).filter(Boolean));
  const batch = writeBatch(db);
  sinLane.forEach((p) => {
    const lane = calcularSiguienteLane(lanesUsados, lanesUsados.size);
    lanesUsados.add(lane);
    batch.update(doc(db, PARTICIPANTES_COL, p.id), { lane });
  });
  await batch.commit();
}

/** Rellena los campos que podrían faltar en datos guardados con una versión anterior. */
function normalizarActividad(id, data) {
  return {
    id,
    nombre: data.nombre || 'Sin actividad',
    puntos: data.puntos || 0,
    inicio: data.inicio || null,
    fin: data.fin || null,
    completados: data.completados || [],
  };
}

/**
 * La primera vez que se abre la app en la vida (nunca antes hubo datos),
 * carga el JSON semilla hacia Firestore. Si existía la actividad única
 * de una versión anterior (documento "config/actividad"), la migra como
 * la primera actividad de la nueva colección.
 *
 * Se controla con una bandera propia ("meta/estado") en vez de mirar si
 * las colecciones están vacías: si se mirara solo eso, borrar la última
 * actividad o al último participante dejaría la colección vacía otra
 * vez y esta función la volvería a rellenar sola con la semilla (bug:
 * una actividad eliminada "resucitaba" sola). Con la bandera, una vez
 * inicializado el sistema no vuelve a sembrar nada nunca más.
 */
async function initSiHaceFalta() {
  if (yaVerificoSemilla) return;
  yaVerificoSemilla = true;

  const metaRef = doc(db, META_COL, META_DOC);
  const metaSnap = await getDoc(metaRef);
  if (metaSnap.exists() && metaSnap.data().inicializado) return; // ya se sembró antes, no tocar nada

  // Si ya hay datos reales (guardados antes de que existiera esta
  // bandera), no reemplazar nada: solo marcar como inicializado.
  const [actividadesSnap, participantesSnap] = await Promise.all([
    getDocs(collection(db, ACTIVIDADES_COL)),
    getDocs(collection(db, PARTICIPANTES_COL)),
  ]);
  if (!actividadesSnap.empty || !participantesSnap.empty) {
    await setDoc(metaRef, { inicializado: true });
    return;
  }

  // Migración desde la versión anterior (una sola actividad guardada
  // en config/actividad), si existiera.
  const viejaSnap = await getDoc(doc(db, 'config', 'actividad'));
  if (viejaSnap.exists()) {
    await setDoc(doc(db, ACTIVIDADES_COL, 'a1'), viejaSnap.data());
    await setDoc(metaRef, { inicializado: true });
    return;
  }

  let semilla;
  try {
    const res = await fetch(SEED_URL);
    semilla = await res.json();
  } catch (err) {
    semilla = { actividades: [], participantes: [] };
  }

  const batch = writeBatch(db);
  (semilla.actividades || []).forEach((a) => {
    const { id, ...datos } = a;
    batch.set(doc(db, ACTIVIDADES_COL, id), datos);
  });
  (semilla.participantes || []).forEach((p) => {
    const { id, ...datos } = p;
    batch.set(doc(db, PARTICIPANTES_COL, id), datos);
  });
  batch.set(metaRef, { inicializado: true });
  await batch.commit();
}

async function init() {
  await initSiHaceFalta();
  await asegurarLanesAsignados();
}

/** Devuelve todas las actividades activas, normalizadas. */
async function getActividades() {
  await initSiHaceFalta();
  const snap = await getDocs(collection(db, ACTIVIDADES_COL));
  return snap.docs.map((d) => normalizarActividad(d.id, d.data()));
}

/** Crea una actividad nueva. */
async function agregarActividad(actividad) {
  await initSiHaceFalta();
  const id = 'a' + Date.now();
  await setDoc(doc(db, ACTIVIDADES_COL, id), { ...actividad, completados: [] });
  return getActividades();
}

/**
 * Actualiza los datos de una actividad existente (nombre, puntos,
 * fechas...). A diferencia de crear una actividad nueva, esto NO
 * reinicia quién ya la completó, salvo que `cambios` lo incluya
 * explícitamente.
 */
async function actualizarActividad(id, cambios) {
  await updateDoc(doc(db, ACTIVIDADES_COL, id), cambios);
  return getActividades();
}

/** Elimina una actividad. */
async function eliminarActividad(id) {
  await deleteDoc(doc(db, ACTIVIDADES_COL, id));
  return getActividades();
}

/** Devuelve la lista completa de participantes. */
async function getParticipantes() {
  await initSiHaceFalta();
  const snap = await getDocs(collection(db, PARTICIPANTES_COL));
  return snap.docs.map((d) => ({ id: d.id, genero: 'masculino', ...d.data() }));
}

/** Guarda la lista completa de participantes (reemplaza uno por uno). */
async function saveParticipantes(lista) {
  await initSiHaceFalta();
  const batch = writeBatch(db);
  lista.forEach((p) => {
    const { id, ...datos } = p;
    batch.set(doc(db, PARTICIPANTES_COL, id), datos);
  });
  await batch.commit();
  return lista;
}

/**
 * Agrega un participante nuevo, asignándole su carril fijo (a menos
 * que ya venga uno explícito). Ese carril nunca vuelve a cambiar.
 * El género (masculino/femenino) decide qué personaje usa en el mapa;
 * por defecto es "masculino" si no se especifica.
 */
async function addParticipante(participante) {
  await initSiHaceFalta();
  const id = participante.id || 'p' + Date.now();
  const { id: _ignorar, lane: laneExplicito, genero, ...datos } = participante;

  let lane = laneExplicito;
  if (!lane) {
    const existentes = await getParticipantes();
    const lanesUsados = new Set(existentes.map((p) => p.lane).filter(Boolean));
    lane = calcularSiguienteLane(lanesUsados, existentes.length);
  }

  await setDoc(doc(db, PARTICIPANTES_COL, id), { ...datos, lane, genero: genero || 'masculino' });
  return getParticipantes();
}

/** Actualiza campos de un participante existente por id. */
async function updateParticipante(id, cambios) {
  await updateDoc(doc(db, PARTICIPANTES_COL, id), cambios);
  return getParticipantes();
}

/** Elimina un participante por id. */
async function deleteParticipante(id) {
  await deleteDoc(doc(db, PARTICIPANTES_COL, id));
  return getParticipantes();
}

/** Suma (o resta, con delta negativo) puntos a un participante. */
async function addPuntos(id, delta) {
  const ref = doc(db, PARTICIPANTES_COL, id);
  const snap = await getDoc(ref);
  const puntosActuales = snap.exists() ? snap.data().puntos || 0 : 0;
  await updateDoc(ref, { puntos: Math.max(0, puntosActuales + delta) });
  return getParticipantes();
}

/**
 * Da los puntos de UNA actividad a UN solo participante y lo marca
 * como "ya completado" en esa actividad, para que no se le pueda
 * volver a acreditar por error.
 */
async function marcarCumplido(actividadId, participanteId) {
  const actividadRef = doc(db, ACTIVIDADES_COL, actividadId);
  const actividadSnap = await getDoc(actividadRef);
  const actividad = normalizarActividad(actividadId, actividadSnap.exists() ? actividadSnap.data() : {});

  if (actividad.completados.includes(participanteId)) {
    return { participantes: await getParticipantes(), actividad };
  }

  const participanteRef = doc(db, PARTICIPANTES_COL, participanteId);
  const participanteSnap = await getDoc(participanteRef);
  const puntosActuales = participanteSnap.exists() ? participanteSnap.data().puntos || 0 : 0;
  await updateDoc(participanteRef, { puntos: puntosActuales + actividad.puntos });

  const completados = [...actividad.completados, participanteId];
  await updateDoc(actividadRef, { completados });

  return { participantes: await getParticipantes(), actividad: { ...actividad, completados } };
}

/** Da los mismos puntos de UNA actividad a TODOS los participantes. */
async function otorgarPuntosActividadATodos(actividadId) {
  const actividadRef = doc(db, ACTIVIDADES_COL, actividadId);
  const actividadSnap = await getDoc(actividadRef);
  const actividad = normalizarActividad(actividadId, actividadSnap.exists() ? actividadSnap.data() : {});
  const participantes = await getParticipantes();

  const batch = writeBatch(db);
  participantes.forEach((p) => {
    batch.update(doc(db, PARTICIPANTES_COL, p.id), { puntos: p.puntos + actividad.puntos });
  });
  batch.update(actividadRef, { completados: participantes.map((p) => p.id) });
  await batch.commit();

  return getParticipantes();
}

/**
 * Avisa a `callback` cada vez que cambian los participantes o
 * cualquier actividad en Firestore (sin importar desde qué celular se
 * hizo el cambio). Devuelve una función para cancelar la suscripción.
 */
function suscribirCambios(callback) {
  const cancelarActividades = onSnapshot(collection(db, ACTIVIDADES_COL), () => callback());
  const cancelarParticipantes = onSnapshot(collection(db, PARTICIPANTES_COL), () => callback());
  return () => {
    cancelarActividades();
    cancelarParticipantes();
  };
}

window.DataService = {
  init,
  getActividades,
  agregarActividad,
  actualizarActividad,
  eliminarActividad,
  getParticipantes,
  saveParticipantes,
  addParticipante,
  updateParticipante,
  deleteParticipante,
  addPuntos,
  marcarCumplido,
  otorgarPuntosActividadATodos,
  suscribirCambios,
};
