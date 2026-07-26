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

/** Convierte una fecha ISO guardada en los datos al formato que espera
 *  un <input type="datetime-local"> ("YYYY-MM-DDTHH:mm", hora local). */
function isoAInputLocal(iso) {
  if (!iso) return '';
  const fecha = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}` +
    `T${pad(fecha.getHours())}:${pad(fecha.getMinutes())}`
  );
}

/** Convierte el valor de un <input type="datetime-local"> a ISO (o null si está vacío). */
function inputLocalAIso(valor) {
  return valor ? new Date(valor).toISOString() : null;
}

/* --------------------------------------------------------------------
 * LOGIN / SESIÓN
 * ------------------------------------------------------------------ */

// Refresca la lista de participantes cada cierto tiempo mientras el panel
// está abierto, para que el aviso de "actividad finalizada" aparezca solo
// en cuanto se cumple la hora límite (sin que el admin tenga que recargar).
let intervaloRevisionVencimiento = null;

// Si otro admin (u otro celular) cambia algo, esta suscripción a
// Firestore avisa para refrescar la vista en tiempo real.
let cancelarSuscripcion = null;

/**
 * Si el admin está en medio de escribir un nombre en la lista, no la
 * reconstruyamos debajo de sus dedos: se espera a que termine (blur)
 * para no perder lo que estaba escribiendo.
 */
function hayEdicionDeNombreEnCurso() {
  const activo = document.activeElement;
  return Boolean(activo && activo.tagName === 'INPUT' && activo.closest('#listaParticipantesAdmin'));
}

async function renderParticipantesSiNoHayEdicion() {
  if (hayEdicionDeNombreEnCurso()) return;
  await renderParticipantes();
}

function mostrarPanel() {
  document.getElementById('vistaLogin').classList.add('oculto');
  document.getElementById('vistaPanel').classList.remove('oculto');
  iniciarPanel();

  clearInterval(intervaloRevisionVencimiento);
  intervaloRevisionVencimiento = setInterval(renderParticipantesSiNoHayEdicion, 30000);

  // Solo se refresca la lista de participantes (no el formulario de
  // actividad), para no interrumpir al admin si justo está escribiendo
  // ahí cuando llega un cambio desde otro celular.
  if (cancelarSuscripcion) cancelarSuscripcion();
  cancelarSuscripcion = DataService.suscribirCambios(() => renderParticipantesSiNoHayEdicion());
}

function mostrarLogin() {
  document.getElementById('vistaPanel').classList.add('oculto');
  document.getElementById('vistaLogin').classList.remove('oculto');
  clearInterval(intervaloRevisionVencimiento);
  if (cancelarSuscripcion) {
    cancelarSuscripcion();
    cancelarSuscripcion = null;
  }
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
  document.getElementById('inputActividadInicio').value = isoAInputLocal(actividad.inicio);
  document.getElementById('inputActividadFin').value = isoAInputLocal(actividad.fin);
}

function configurarFormActividad() {
  const form = document.getElementById('formActividad');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = document.getElementById('inputActividadNombre').value.trim();
    const puntos = parseInt(document.getElementById('inputActividadPuntos').value, 10) || 0;
    const inicio = inputLocalAIso(document.getElementById('inputActividadInicio').value);
    const fin = inputLocalAIso(document.getElementById('inputActividadFin').value);
    await DataService.setActividad({ nombre, puntos, inicio, fin });
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

/**
 * Lee una foto y la redimensiona/comprime antes de guardarla.
 *
 * Firestore rechaza documentos de más de 1 MB, y una foto de celular
 * sin procesar fácilmente pesa varios MB en base64. Como los avatares
 * se muestran siempre muy pequeños (mapa y ranking), no hace falta
 * más resolución que esta para que se vean nítidos.
 */
function leerFotoComoDataURL(archivo, ladoMaximo = 160, calidad = 0.75) {
  return new Promise((resolve) => {
    if (!archivo) return resolve('');
    const lector = new FileReader();
    lector.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width >= height && width > ladoMaximo) {
          height = Math.round((height * ladoMaximo) / width);
          width = ladoMaximo;
        } else if (height > ladoMaximo) {
          width = Math.round((width * ladoMaximo) / height);
          height = ladoMaximo;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', calidad));
      };
      img.onerror = () => resolve('');
      img.src = lector.result;
    };
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
    try {
      await DataService.addParticipante({
        nombre,
        puntos,
        foto,
        color: colorAleatorio(),
      });
    } catch (err) {
      alert('No se pudo guardar el participante. Intenta con otra foto (más liviana) o sin foto.');
      return;
    }

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

  // La actividad ya venció si tiene fecha de fin y esa fecha ya pasó:
  // después de eso ya no se puede marcar a nadie más como "Cumplió".
  const actividadVencida = Boolean(actividad.fin) && new Date() > new Date(actividad.fin);
  const completados = actividad.completados || [];

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

      const yaCumplio = completados.includes(participante.id);
      let controlCumplido;
      if (yaCumplio) {
        controlCumplido = `<span class="badge-estado badge-estado--ok">✅ Ya cumplió</span>`;
      } else if (actividadVencida) {
        controlCumplido = `<span class="badge-estado badge-estado--vencido">⏳ Actividad finalizada</span>`;
      } else {
        controlCumplido = `
          <button type="button" class="btn btn-oro btn-sm" data-accion="cumplio" title="Dar los puntos de la actividad actual a este participante">
            ✅ Cumplió (+${actividad.puntos})
          </button>
        `;
      }

      const acciones = document.createElement('div');
      acciones.className = 'participante-admin-acciones';
      acciones.innerHTML = `
        <div class="puntos-control">
          <button type="button" data-accion="restar" title="Restar 5 puntos">−</button>
          <span>${participante.puntos} pts</span>
          <button type="button" data-accion="sumar" title="Sumar 5 puntos">+</button>
        </div>
        ${controlCumplido}
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

      const btnCumplio = acciones.querySelector('[data-accion="cumplio"]');
      if (btnCumplio) {
        btnCumplio.addEventListener('click', async () => {
          await DataService.marcarCumplido(participante.id);
          await renderParticipantes();
        });
      }

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
          try {
            await DataService.updateParticipante(participante.id, { foto });
            await renderParticipantes();
          } catch (err) {
            alert('No se pudo guardar la foto. Intenta con otra imagen.');
          }
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
