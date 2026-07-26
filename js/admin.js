/**
 * admin.js
 * ------------------------------------------------------------------
 * Lógica del PANEL ADMINISTRADOR (admin.html).
 * Aquí sí se escriben datos: usa siempre DataService (nunca localStorage
 * directo) para que el día de mañana el cambio a Firebase sea invisible
 * para esta pantalla.
 * ------------------------------------------------------------------
 */

let coloresDisponibles = ['#FF6B6B', '#4D96FF', '#FFB84D', '#9B5DE5', '#00C2A8', '#F15BB5', '#FFC93C', '#2EC4B6'];

function colorAleatorio() {
  return coloresDisponibles[Math.floor(Math.random() * coloresDisponibles.length)];
}

function obtenerIniciales(nombre) {
  return nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

/* --------------------------------------------------------------------
 * LOGIN / SESIÓN
 * ------------------------------------------------------------------ */

function mostrarPanel() {
  document.getElementById('vistaLogin').classList.add('oculto');
  document.getElementById('vistaPanel').classList.remove('oculto');
  iniciarPanel();
}

function mostrarLogin() {
  document.getElementById('vistaPanel').classList.add('oculto');
  document.getElementById('vistaLogin').classList.remove('oculto');
}

function configurarLogin() {
  const form = document.getElementById('formLogin');
  const error = document.getElementById('loginError');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const usuario = document.getElementById('inputUsuario').value.trim();
    const clave = document.getElementById('inputClave').value;

    if (AuthService.login(usuario, clave)) {
      error.textContent = '';
      mostrarPanel();
    } else {
      error.textContent = 'Usuario o contraseña incorrectos.';
    }
  });

  document.getElementById('btnLogout').addEventListener('click', () => {
    AuthService.logout();
    mostrarLogin();
  });
}

/* --------------------------------------------------------------------
 * ACTIVIDAD ACTUAL
 * ------------------------------------------------------------------ */

async function renderFormActividad() {
  const actividad = await DataService.getActividad();
  document.getElementById('inputActividadNombre').value = actividad.nombre;
  document.getElementById('inputActividadPuntos').value = actividad.puntos;
}

function configurarFormActividad() {
  const form = document.getElementById('formActividad');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = document.getElementById('inputActividadNombre').value.trim();
    const puntos = parseInt(document.getElementById('inputActividadPuntos').value, 10) || 0;
    await DataService.setActividad({ nombre, puntos });
    mostrarAviso('avisoActividad');
    await renderParticipantes();
  });

  document.getElementById('btnOtorgarATodos').addEventListener('click', async () => {
    const ok = confirm('¿Dar los puntos de la actividad actual a TODOS los participantes?');
    if (!ok) return;
    await DataService.otorgarPuntosActividadATodos();
    await renderParticipantes();
  });
}

function mostrarAviso(id) {
  const el = document.getElementById(id);
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), 1800);
}

/* --------------------------------------------------------------------
 * AGREGAR PARTICIPANTE
 * ------------------------------------------------------------------ */

function leerFotoComoDataURL(archivo) {
  return new Promise((resolve) => {
    if (!archivo) return resolve('');
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result);
    lector.onerror = () => resolve('');
    lector.readAsDataURL(archivo);
  });
}

function configurarFormNuevoParticipante() {
  const form = document.getElementById('formNuevoParticipante');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = document.getElementById('inputNuevoNombre').value.trim();
    const puntos = parseInt(document.getElementById('inputNuevoPuntos').value, 10) || 0;
    const archivo = document.getElementById('inputNuevoFoto').files[0];
    if (!nombre) return;

    const foto = await leerFotoComoDataURL(archivo);
    await DataService.addParticipante({
      nombre,
      puntos,
      foto,
      color: colorAleatorio(),
    });

    form.reset();
    await renderParticipantes();
  });
}

/* --------------------------------------------------------------------
 * LISTA DE PARTICIPANTES (editar / puntos / foto / eliminar)
 * ------------------------------------------------------------------ */

function crearIniciales(participante) {
  const div = document.createElement('div');
  div.className = 'participante-admin-iniciales';
  div.style.background = participante.color;
  div.textContent = obtenerIniciales(participante.nombre);
  return div;
}

function crearFotoElemento(participante) {
  if (!participante.foto) return crearIniciales(participante);

  const img = document.createElement('img');
  img.className = 'participante-admin-foto';
  img.src = participante.foto;
  img.alt = participante.nombre;
  img.onerror = () => img.replaceWith(crearIniciales(participante));
  return img;
}

async function renderParticipantes() {
  const participantes = await DataService.getParticipantes();
  const actividad = await DataService.getActividad();
  const lista = document.getElementById('listaParticipantesAdmin');
  const vacio = document.getElementById('listaAdminVacia');

  lista.innerHTML = '';

  if (participantes.length === 0) {
    vacio.style.display = 'block';
    return;
  }
  vacio.style.display = 'none';

  participantes
    .slice()
    .sort((a, b) => b.puntos - a.puntos)
    .forEach((participante) => {
      const li = document.createElement('li');
      li.className = 'participante-admin-item';
      li.dataset.id = participante.id;

      const fotoWrap = document.createElement('div');
      fotoWrap.className = 'participante-admin-foto-wrap';
      fotoWrap.style.background = participante.color;
      fotoWrap.appendChild(crearFotoElemento(participante));

      const nombreDiv = document.createElement('div');
      nombreDiv.className = 'participante-admin-nombre';
      const inputNombreEl = document.createElement('input');
      inputNombreEl.type = 'text';
      inputNombreEl.value = participante.nombre;
      inputNombreEl.setAttribute('aria-label', 'Nombre');
      nombreDiv.appendChild(inputNombreEl);

      const acciones = document.createElement('div');
      acciones.className = 'participante-admin-acciones';
      acciones.innerHTML = `
        <div class="puntos-control">
          <button type="button" data-accion="restar" title="Restar 5 puntos">−</button>
          <span>${participante.puntos} pts</span>
          <button type="button" data-accion="sumar" title="Sumar 5 puntos">+</button>
        </div>
        <button type="button" class="btn btn-oro btn-sm" data-accion="cumplio" title="Dar los puntos de la actividad actual a este participante">
          ✅ Cumplió (+${actividad.puntos})
        </button>
        <input type="file" class="input-foto" accept="image/*" title="Cambiar foto" />
        <button type="button" class="btn btn-peligro btn-sm" data-accion="eliminar">Eliminar</button>
      `;

      li.appendChild(fotoWrap);
      li.appendChild(nombreDiv);
      li.appendChild(acciones);
      lista.appendChild(li);

      // --- eventos de esta fila ---
      const inputNombre = nombreDiv.querySelector('input');
      inputNombre.addEventListener('change', async () => {
        const nuevoNombre = inputNombre.value.trim();
        if (nuevoNombre) await DataService.updateParticipante(participante.id, { nombre: nuevoNombre });
      });

      acciones.querySelector('[data-accion="sumar"]').addEventListener('click', async () => {
        await DataService.addPuntos(participante.id, 5);
        await renderParticipantes();
      });

      acciones.querySelector('[data-accion="restar"]').addEventListener('click', async () => {
        await DataService.addPuntos(participante.id, -5);
        await renderParticipantes();
      });

      acciones.querySelector('[data-accion="cumplio"]').addEventListener('click', async () => {
        const actividadActual = await DataService.getActividad();
        await DataService.addPuntos(participante.id, actividadActual.puntos);
        await renderParticipantes();
      });

      acciones.querySelector('[data-accion="eliminar"]').addEventListener('click', async () => {
        const ok = confirm(`¿Eliminar a ${participante.nombre}?`);
        if (!ok) return;
        await DataService.deleteParticipante(participante.id);
        await renderParticipantes();
      });

      acciones.querySelector('.input-foto').addEventListener('change', async (e) => {
        const archivo = e.target.files[0];
        const foto = await leerFotoComoDataURL(archivo);
        if (foto) {
          await DataService.updateParticipante(participante.id, { foto });
          await renderParticipantes();
        }
      });
    });
}

/* --------------------------------------------------------------------
 * INICIALIZACIÓN
 * ------------------------------------------------------------------ */

async function iniciarPanel() {
  await DataService.init();
  await renderFormActividad();
  await renderParticipantes();
}

document.addEventListener('DOMContentLoaded', async () => {
  await DataService.init();
  configurarLogin();
  configurarFormActividad();
  configurarFormNuevoParticipante();

  if (AuthService.estaAutenticado()) {
    mostrarPanel();
  } else {
    mostrarLogin();
  }
});
