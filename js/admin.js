/**
 * admin.js
 * ------------------------------------------------------------------
 * Lógica del PANEL ADMINISTRADOR (admin.html).
 * Aquí sí se escriben datos: usa siempre DataService (nunca localStorage
 * directo) para que el día de mañana el cambio a Firebase sea invisible
 * para esta pantalla.
 * ------------------------------------------------------------------
 */

// Paleta con el matiz (hue) de cada color separado 40° del siguiente
// (360° / 9), para que nunca haya dos colores parecidos entre sí.
let coloresDisponibles = [
  '#E94957', '#E949C1', '#A649E9', '#4957E9',
  '#49C1E9', '#49E9A6', '#57E949', '#C1E949', '#E9A649',
];

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

/** Recorta un texto largo (ej. nombre de actividad) para que quepa en un botón/badge. */
function acortarTexto(texto, maxLargo = 16) {
  return texto.length > maxLargo ? texto.slice(0, maxLargo - 1) + '…' : texto;
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

// Refresca las listas cada cierto tiempo mientras el panel está abierto,
// para que el aviso de "actividad finalizada" aparezca solo en cuanto
// se cumple la hora límite (sin que el admin tenga que recargar).
let intervaloRevisionVencimiento = null;

// Si otro admin (u otro celular) cambia algo, esta suscripción a
// Firestore avisa para refrescar la vista en tiempo real.
let cancelarSuscripcion = null;

/**
 * Si el admin está en medio de escribir un nombre/actividad, no
 * reconstruyamos la lista debajo de sus dedos: se espera a que termine
 * (blur) para no perder lo que estaba escribiendo.
 */
function hayEdicionEnCurso() {
  const activo = document.activeElement;
  const enfocandoInput = Boolean(
    activo &&
      activo.tagName === 'INPUT' &&
      (activo.closest('#listaParticipantesAdmin') || activo.closest('#listaActividadesAdmin'))
  );
  // También cuenta como "en curso" si algún participante quedó con el
  // lápiz activo (nombre/foto/género habilitados a la espera de
  // "Aplicar cambios"), aunque en ese instante no haya foco en un input.
  const editandoDatosParticipante = Boolean(document.querySelector('.btn-lapiz--activo'));
  return enfocandoInput || editandoDatosParticipante;
}

async function refrescarSiNoHayEdicion() {
  if (hayEdicionEnCurso()) return;
  await Promise.all([renderActividadesAdmin(), renderParticipantes()]);
}

function mostrarPanel() {
  document.getElementById('vistaLogin').classList.add('oculto');
  document.getElementById('vistaPanel').classList.remove('oculto');
  iniciarPanel();

  clearInterval(intervaloRevisionVencimiento);
  intervaloRevisionVencimiento = setInterval(refrescarSiNoHayEdicion, 30000);

  if (cancelarSuscripcion) cancelarSuscripcion();
  cancelarSuscripcion = DataService.suscribirCambios(() => refrescarSiNoHayEdicion());
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

function mostrarAviso(el) {
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), 1800);
}

/* --------------------------------------------------------------------
 * ACTIVIDADES (puede haber una o varias a la vez)
 * ------------------------------------------------------------------ */

/** Arma la fila/tarjeta editable de UNA actividad, con sus propios eventos. */
function crearFilaActividad(actividad) {
  const li = document.createElement('li');
  li.className = 'actividad-admin-item';
  li.dataset.id = actividad.id;

  li.innerHTML = `
    <div class="fila">
      <div class="campo">
        <label>Nombre de la actividad</label>
        <input type="text" class="input-actividad-nombre" />
      </div>
      <div class="campo">
        <label>Puntos que vale</label>
        <input type="number" min="0" class="input-actividad-puntos" />
      </div>
    </div>
    <div class="fila fila--fechas">
      <div class="campo">
        <label>Inicio (opcional)</label>
        <input type="datetime-local" class="input-actividad-inicio" />
      </div>
      <div class="campo">
        <label>Fin / límite (opcional)</label>
        <input type="datetime-local" class="input-actividad-fin" />
      </div>
    </div>
    <div class="actividad-admin-botones">
      <button type="button" class="btn btn-primario btn-sm" data-accion="guardar">Guardar cambios</button>
      <span class="aviso-guardado" data-aviso>Guardado ✓</span>
      <button type="button" class="btn btn-oro btn-sm" data-accion="dar-a-todos">🎁 Dar a todos</button>
      <button type="button" class="btn btn-peligro btn-sm" data-accion="eliminar-actividad">Eliminar</button>
    </div>
  `;

  li.querySelector('.input-actividad-nombre').value = actividad.nombre;
  li.querySelector('.input-actividad-puntos').value = actividad.puntos;
  li.querySelector('.input-actividad-inicio').value = isoAInputLocal(actividad.inicio);
  li.querySelector('.input-actividad-fin').value = isoAInputLocal(actividad.fin);

  li.querySelector('[data-accion="guardar"]').addEventListener('click', async () => {
    const nombre = li.querySelector('.input-actividad-nombre').value.trim();
    const puntos = parseInt(li.querySelector('.input-actividad-puntos').value, 10) || 0;
    const inicio = inputLocalAIso(li.querySelector('.input-actividad-inicio').value);
    const fin = inputLocalAIso(li.querySelector('.input-actividad-fin').value);
    if (!nombre) return;

    await DataService.actualizarActividad(actividad.id, { nombre, puntos, inicio, fin });
    mostrarAviso(li.querySelector('[data-aviso]'));
    await renderParticipantes(); // los botones "cumplió" muestran nombre/puntos al día
  });

  li.querySelector('[data-accion="dar-a-todos"]').addEventListener('click', async () => {
    const ok = confirm(`¿Dar los puntos de "${actividad.nombre}" a TODOS los participantes?`);
    if (!ok) return;
    await DataService.otorgarPuntosActividadATodos(actividad.id);
    await renderParticipantes();
  });

  li.querySelector('[data-accion="eliminar-actividad"]').addEventListener('click', async () => {
    const ok = confirm(`¿Eliminar la actividad "${actividad.nombre}"? Esto no quita los puntos ya otorgados.`);
    if (!ok) return;
    await DataService.eliminarActividad(actividad.id);
    await renderActividadesAdmin();
    await renderParticipantes();
  });

  return li;
}

async function renderActividadesAdmin() {
  const actividades = await DataService.getActividades();
  const lista = document.getElementById('listaActividadesAdmin');
  const vacia = document.getElementById('listaActividadesVacia');

  lista.innerHTML = '';
  if (actividades.length === 0) {
    vacia.style.display = 'block';
    return;
  }
  vacia.style.display = 'none';
  actividades.forEach((actividad) => lista.appendChild(crearFilaActividad(actividad)));
}

function configurarFormNuevaActividad() {
  const btnMostrar = document.getElementById('btnMostrarFormNuevaActividad');
  const form = document.getElementById('formNuevaActividad');

  btnMostrar.addEventListener('click', () => {
    form.classList.toggle('oculto');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = document.getElementById('inputNuevaActividadNombre').value.trim();
    const puntos = parseInt(document.getElementById('inputNuevaActividadPuntos').value, 10) || 0;
    const inicio = inputLocalAIso(document.getElementById('inputNuevaActividadInicio').value);
    const fin = inputLocalAIso(document.getElementById('inputNuevaActividadFin').value);
    if (!nombre) return;

    await DataService.agregarActividad({ nombre, puntos, inicio, fin });
    form.reset();
    form.classList.add('oculto');
    await renderActividadesAdmin();
    await renderParticipantes();
  });
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
    const genero = document.getElementById('inputNuevoGenero').value;
    const archivo = document.getElementById('inputNuevoFoto').files[0];
    if (!nombre) return;

    const foto = await leerFotoComoDataURL(archivo);
    try {
      await DataService.addParticipante({
        nombre,
        puntos,
        genero,
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
 * LISTA DE PARTICIPANTES (editar / puntos / foto / cumplió / eliminar)
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

/**
 * Arma el grupo de "pastillas" de cumplido de un participante: una por
 * cada actividad activa (puede haber 0, 1 o varias a la vez).
 */
function crearCumplidos(participante, actividades) {
  const grupo = document.createElement('div');
  grupo.className = 'participante-admin-cumplidos';

  actividades.forEach((actividad) => {
    const completados = actividad.completados || [];
    const yaCumplio = completados.includes(participante.id);
    const vencida = Boolean(actividad.fin) && new Date() > new Date(actividad.fin);
    const nombreCorto = acortarTexto(actividad.nombre);

    if (yaCumplio) {
      const badge = document.createElement('span');
      badge.className = 'badge-estado badge-estado--ok';
      badge.title = `Ya cumplió: ${actividad.nombre}`;
      badge.textContent = `✅ ${nombreCorto}`;
      grupo.appendChild(badge);
    } else if (vencida) {
      const badge = document.createElement('span');
      badge.className = 'badge-estado badge-estado--vencido';
      badge.title = `${actividad.nombre}: actividad finalizada`;
      badge.textContent = `⏳ ${nombreCorto}`;
      grupo.appendChild(badge);
    } else {
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'btn btn-oro btn-sm';
      boton.title = `Dar los puntos de "${actividad.nombre}" a este participante`;
      boton.textContent = `✅ ${nombreCorto} (+${actividad.puntos})`;
      boton.addEventListener('click', async () => {
        await DataService.marcarCumplido(actividad.id, participante.id);
        await renderParticipantes();
      });
      grupo.appendChild(boton);
    }
  });

  return grupo;
}

async function renderParticipantes() {
  const [participantes, actividades] = await Promise.all([
    DataService.getParticipantes(),
    DataService.getActividades(),
  ]);
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
      nombreDiv.innerHTML = `
        <input type="text" aria-label="Nombre" disabled />
        <button type="button" class="btn-lapiz" data-accion="editar-datos" title="Editar nombre, foto y género">✏️</button>
      `;
      nombreDiv.querySelector('input').value = participante.nombre;

      const acciones = document.createElement('div');
      acciones.className = 'participante-admin-acciones';
      acciones.innerHTML = `
        <div class="puntos-control">
          <button type="button" data-accion="restar" title="Restar 100 puntos">−</button>
          <span class="puntos-valor" data-accion="editar-puntos" title="Click para escribir los puntos" tabindex="0">${participante.puntos} pts</span>
          <button type="button" data-accion="sumar" title="Sumar 100 puntos">+</button>
        </div>
        <select class="select-genero" title="Género" disabled>
          <option value="masculino">Hombre</option>
          <option value="femenino">Mujer</option>
        </select>
        <input type="file" class="input-foto" accept="image/*" title="Cambiar foto" disabled />
        <button type="button" class="btn btn-primario btn-sm oculto" data-accion="aplicar-cambios">Aplicar cambios</button>
        <button type="button" class="btn btn-peligro btn-sm" data-accion="eliminar">Eliminar</button>
      `;
      acciones.querySelector('.select-genero').value = participante.genero === 'femenino' ? 'femenino' : 'masculino';
      acciones.insertBefore(crearCumplidos(participante, actividades), acciones.querySelector('.input-foto'));

      li.appendChild(fotoWrap);
      li.appendChild(nombreDiv);
      li.appendChild(acciones);
      lista.appendChild(li);

      // --- eventos de esta fila ---

      // Puntos: sumar/restar de 100 en 100, o hacer click en el número
      // para escribir directamente la cantidad que se quiera.
      acciones.querySelector('[data-accion="sumar"]').addEventListener('click', async () => {
        await DataService.addPuntos(participante.id, 100);
        await renderParticipantes();
      });

      acciones.querySelector('[data-accion="restar"]').addEventListener('click', async () => {
        await DataService.addPuntos(participante.id, -100);
        await renderParticipantes();
      });

      const spanPuntos = acciones.querySelector('.puntos-valor');
      function activarEdicionPuntos() {
        const inputPuntos = document.createElement('input');
        inputPuntos.type = 'number';
        inputPuntos.min = '0';
        inputPuntos.className = 'puntos-input-manual';
        inputPuntos.value = participante.puntos;
        spanPuntos.replaceWith(inputPuntos);
        inputPuntos.focus();
        inputPuntos.select();

        let confirmado = false;
        const confirmar = async () => {
          if (confirmado) return;
          confirmado = true;
          const nuevo = Math.max(0, parseInt(inputPuntos.value, 10) || 0);
          await DataService.updateParticipante(participante.id, { puntos: nuevo });
          await renderParticipantes();
        };
        inputPuntos.addEventListener('blur', confirmar);
        inputPuntos.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            inputPuntos.blur();
          } else if (e.key === 'Escape') {
            confirmado = true;
            renderParticipantes();
          }
        });
      }
      spanPuntos.addEventListener('click', activarEdicionPuntos);
      spanPuntos.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activarEdicionPuntos();
        }
      });

      // Nombre, foto y género: bloqueados hasta que se haga click en el
      // lápiz. Ahí se habilitan para editar y aparece "Aplicar cambios",
      // que guarda y vuelve a bloquear todo.
      const inputNombre = nombreDiv.querySelector('input');
      const btnLapiz = nombreDiv.querySelector('[data-accion="editar-datos"]');
      const selectGenero = acciones.querySelector('.select-genero');
      const inputFoto = acciones.querySelector('.input-foto');
      const btnAplicar = acciones.querySelector('[data-accion="aplicar-cambios"]');

      function activarEdicionDatos() {
        inputNombre.disabled = false;
        selectGenero.disabled = false;
        inputFoto.disabled = false;
        btnAplicar.classList.remove('oculto');
        btnLapiz.classList.add('btn-lapiz--activo');
        inputNombre.focus();
      }

      function desactivarEdicionDatos() {
        inputNombre.disabled = true;
        selectGenero.disabled = true;
        inputFoto.disabled = true;
        btnAplicar.classList.add('oculto');
        btnLapiz.classList.remove('btn-lapiz--activo');
      }

      btnLapiz.addEventListener('click', () => {
        if (inputNombre.disabled) {
          activarEdicionDatos();
        } else {
          // Cancelar: descarta lo escrito y vuelve a bloquear.
          inputNombre.value = participante.nombre;
          selectGenero.value = participante.genero === 'femenino' ? 'femenino' : 'masculino';
          inputFoto.value = '';
          desactivarEdicionDatos();
        }
      });

      btnAplicar.addEventListener('click', async () => {
        const nuevoNombre = inputNombre.value.trim();
        const archivo = inputFoto.files[0];
        const cambios = {};
        if (nuevoNombre && nuevoNombre !== participante.nombre) cambios.nombre = nuevoNombre;
        if (selectGenero.value !== participante.genero) cambios.genero = selectGenero.value;
        if (archivo) cambios.foto = await leerFotoComoDataURL(archivo);

        if (Object.keys(cambios).length > 0) {
          try {
            await DataService.updateParticipante(participante.id, cambios);
          } catch (err) {
            alert('No se pudo guardar. Intenta con otra foto (más liviana) o sin foto.');
            return;
          }
        }
        desactivarEdicionDatos();
        await renderParticipantes();
      });

      acciones.querySelector('[data-accion="eliminar"]').addEventListener('click', async () => {
        const ok = confirm(`¿Eliminar a ${participante.nombre}?`);
        if (!ok) return;
        await DataService.deleteParticipante(participante.id);
        await renderParticipantes();
      });
    });
}

/* --------------------------------------------------------------------
 * INICIALIZACIÓN
 * ------------------------------------------------------------------ */

async function iniciarPanel() {
  await DataService.init();
  await renderActividadesAdmin();
  await renderParticipantes();
}

document.addEventListener('DOMContentLoaded', async () => {
  await DataService.init();
  configurarLogin();
  configurarFormNuevaActividad();
  configurarFormNuevoParticipante();

  if (AuthService.estaAutenticado()) {
    mostrarPanel();
  } else {
    mostrarLogin();
  }
});
