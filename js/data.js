/**
 * data.js
 * ------------------------------------------------------------------
 * Capa de acceso a datos (Data Service).
 *
 * Toda la aplicación (app.js, admin.js) habla con los datos SOLO a
 * través del objeto `DataService`. Hoy internamente usa LocalStorage,
 * pero cada método es `async` y devuelve Promesas a propósito: el día
 * de mañana se puede reemplazar el contenido de estas funciones por
 * llamadas a Firebase (Firestore/Realtime Database) sin tocar ni una
 * línea de app.js ni admin.js, porque la "forma" de la API no cambia.
 *
 * Estructura de datos (misma forma que data/participantes.json):
 * {
 *   actividad: { nombre: string, puntos: number },
 *   participantes: [
 *     { id, nombre, foto, puntos, color }
 *   ]
 * }
 * ------------------------------------------------------------------
 */

const DataService = (() => {
  const STORAGE_KEY = 'camp2027_data';
  const SEED_URL = 'data/participantes.json';

  /** Lee el estado completo desde LocalStorage (fuente de verdad actual). */
  function readRaw() {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  /** Escribe el estado completo en LocalStorage. */
  function writeRaw(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  /**
   * Se asegura de que exista información en LocalStorage.
   * Si es la primera vez que se abre la app, carga el JSON semilla.
   */
  async function init() {
    let state = readRaw();
    if (!state) {
      try {
        const res = await fetch(SEED_URL);
        state = await res.json();
      } catch (err) {
        // Si el fetch falla (por ejemplo al abrir el archivo con file://)
        // arrancamos con datos vacíos en vez de romper la app.
        state = { actividad: { nombre: 'Sin actividad', puntos: 0 }, participantes: [] };
      }
      writeRaw(state);
    }
    return state;
  }

  /** Devuelve la actividad actual { nombre, puntos }. */
  async function getActividad() {
    const state = readRaw() || (await init());
    return state.actividad;
  }

  /** Reemplaza la actividad actual. */
  async function setActividad(actividad) {
    const state = readRaw() || (await init());
    state.actividad = actividad;
    writeRaw(state);
    return state.actividad;
  }

  /** Devuelve la lista completa de participantes. */
  async function getParticipantes() {
    const state = readRaw() || (await init());
    return state.participantes;
  }

  /** Guarda la lista completa de participantes. */
  async function saveParticipantes(lista) {
    const state = readRaw() || (await init());
    state.participantes = lista;
    writeRaw(state);
    return lista;
  }

  /** Agrega un participante nuevo. */
  async function addParticipante(participante) {
    const state = readRaw() || (await init());
    const id = participante.id || 'p' + Date.now();
    state.participantes.push({ ...participante, id });
    writeRaw(state);
    return state.participantes;
  }

  /** Actualiza campos de un participante existente por id. */
  async function updateParticipante(id, cambios) {
    const state = readRaw() || (await init());
    state.participantes = state.participantes.map((p) =>
      p.id === id ? { ...p, ...cambios } : p
    );
    writeRaw(state);
    return state.participantes;
  }

  /** Elimina un participante por id. */
  async function deleteParticipante(id) {
    const state = readRaw() || (await init());
    state.participantes = state.participantes.filter((p) => p.id !== id);
    writeRaw(state);
    return state.participantes;
  }

  /** Suma (o resta, con delta negativo) puntos a un participante. */
  async function addPuntos(id, delta) {
    const state = readRaw() || (await init());
    state.participantes = state.participantes.map((p) =>
      p.id === id ? { ...p, puntos: Math.max(0, p.puntos + delta) } : p
    );
    writeRaw(state);
    return state.participantes;
  }

  /** Da los mismos puntos de la actividad actual a TODOS los participantes. */
  async function otorgarPuntosActividadATodos() {
    const state = readRaw() || (await init());
    const puntosActividad = state.actividad.puntos;
    state.participantes = state.participantes.map((p) => ({
      ...p,
      puntos: p.puntos + puntosActividad,
    }));
    writeRaw(state);
    return state.participantes;
  }

  return {
    init,
    getActividad,
    setActividad,
    getParticipantes,
    saveParticipantes,
    addParticipante,
    updateParticipante,
    deleteParticipante,
    addPuntos,
    otorgarPuntosActividadATodos,
  };
})();
