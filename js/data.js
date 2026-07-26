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
 * - Documento "config/actividad": la actividad actual
 *   ({ nombre, puntos, inicio, fin, completados }).
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
const SEED_URL = 'data/participantes.json';
const actividadRef = doc(db, 'config', 'actividad');

let yaVerificoSemilla = false;

/**
 * La primera vez que alguien abre la app (base de datos vacía), carga
 * el JSON semilla hacia Firestore. Las siguientes veces no hace nada.
 */
async function initSiHaceFalta() {
  if (yaVerificoSemilla) return;
  yaVerificoSemilla = true;

  const actividadSnap = await getDoc(actividadRef);
  if (actividadSnap.exists()) return; // ya hay datos reales, no tocar nada

  let semilla;
  try {
    const res = await fetch(SEED_URL);
    semilla = await res.json();
  } catch (err) {
    semilla = {
      actividad: { nombre: 'Sin actividad', puntos: 0, inicio: null, fin: null, completados: [] },
      participantes: [],
    };
  }

  await setDoc(actividadRef, semilla.actividad);
  const batch = writeBatch(db);
  semilla.participantes.forEach((p) => {
    const { id, ...datos } = p;
    batch.set(doc(db, PARTICIPANTES_COL, id), datos);
  });
  await batch.commit();
}

async function init() {
  await initSiHaceFalta();
}

/** Devuelve la actividad actual, normalizada. */
async function getActividad() {
  await initSiHaceFalta();
  const snap = await getDoc(actividadRef);
  const data = snap.exists() ? snap.data() : {};
  return {
    nombre: data.nombre || 'Sin actividad',
    puntos: data.puntos || 0,
    inicio: data.inicio || null,
    fin: data.fin || null,
    completados: data.completados || [],
  };
}

/**
 * Reemplaza la actividad actual. Al guardar se reinicia la lista de
 * "completados": cambiar la actividad es, en la práctica, empezar la
 * semana de cero.
 */
async function setActividad(actividad) {
  await initSiHaceFalta();
  const nueva = { ...actividad, completados: [] };
  await setDoc(actividadRef, nueva);
  return nueva;
}

/** Devuelve la lista completa de participantes. */
async function getParticipantes() {
  await initSiHaceFalta();
  const snap = await getDocs(collection(db, PARTICIPANTES_COL));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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

/** Agrega un participante nuevo. */
async function addParticipante(participante) {
  await initSiHaceFalta();
  const id = participante.id || 'p' + Date.now();
  const { id: _ignorar, ...datos } = participante;
  await setDoc(doc(db, PARTICIPANTES_COL, id), datos);
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
 * Da los puntos de la actividad actual a UN solo participante y lo
 * marca como "ya completado" para que no se le pueda volver a
 * acreditar la misma actividad por error.
 */
async function marcarCumplido(participanteId) {
  const actividad = await getActividad();
  if (actividad.completados.includes(participanteId)) {
    return { participantes: await getParticipantes(), actividad };
  }

  const ref = doc(db, PARTICIPANTES_COL, participanteId);
  const snap = await getDoc(ref);
  const puntosActuales = snap.exists() ? snap.data().puntos || 0 : 0;
  await updateDoc(ref, { puntos: puntosActuales + actividad.puntos });

  const completados = [...actividad.completados, participanteId];
  await updateDoc(actividadRef, { completados });

  return { participantes: await getParticipantes(), actividad: { ...actividad, completados } };
}

/** Da los mismos puntos de la actividad actual a TODOS los participantes. */
async function otorgarPuntosActividadATodos() {
  const actividad = await getActividad();
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
 * Avisa a `callback` cada vez que cambian los participantes o la
 * actividad en Firestore (sin importar desde qué celular se hizo el
 * cambio). Devuelve una función para cancelar la suscripción.
 */
function suscribirCambios(callback) {
  const cancelarActividad = onSnapshot(actividadRef, () => callback());
  const cancelarParticipantes = onSnapshot(collection(db, PARTICIPANTES_COL), () => callback());
  return () => {
    cancelarActividad();
    cancelarParticipantes();
  };
}

window.DataService = {
  init,
  getActividad,
  setActividad,
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
