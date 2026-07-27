# Actividades Camp 2027

Página web responsive tipo videojuego para seguir el progreso de los
participantes de un campamento cristiano, "caminando" sobre un mapa
hacia el campamento según los puntos que van ganando.

Construido solo con **HTML, CSS y JavaScript puro** (sin frameworks).

## Estructura del proyecto

```
actividades-camp/
├── index.html          Página pública (mapa + ranking)
├── admin.html           Login + panel administrador
├── css/
│   ├── style.css        Estilos públicos
│   └── admin.css        Estilos del panel admin
├── js/
│   ├── data.js           Capa de datos (Firebase Firestore)
│   ├── app.js             Lógica de la página pública
│   ├── admin.js           Lógica del panel administrador
│   └── auth.js            Login simple del admin
├── assets/
│   ├── mapa.png          Mapa del camino (NO se modifica)
│   ├── logo.png           Logo opcional (si no existe, se usa un badge CSS)
│   └── avatars/           Fotos de participantes (opcional; se usan iniciales si faltan)
├── data/
│   └── participantes.json  Datos semilla (se cargan la primera vez a Firestore)
└── README.md
```

## Cómo abrir el proyecto

Hay que servir los archivos con un servidor local (no funciona con doble clic
en `index.html`, tanto por las restricciones de `file://` con `fetch()` como
porque `data.js` se carga como módulo ES). Por ejemplo:

```bash
cd actividades-camp
python3 -m http.server 8080
```

Luego abre `http://localhost:8080/index.html`.

## Acceso administrador

- URL: `admin.html` (o el botón ⚙️ flotante en la esquina de la página pública)
- Usuario: `admin`
- Contraseña: `camp2027`

## Actividades: pueden ser varias a la vez

Puede haber **una o varias actividades activas al mismo tiempo** (por ejemplo,
dos retos corriendo la misma semana). Cada una tiene su propio nombre, puntos,
inicio/fin opcionales, y su propia lista de quién ya la cumplió — son
totalmente independientes entre sí.

En el admin, la sección "🎯 Actividades activas" lista todas las actividades,
cada una editable y con su botón para eliminarla o para darle sus puntos a
todos. El botón "➕ Agregar actividad nueva" crea otra en paralelo.

Por cada actividad activa, cada participante tiene una "pastilla"
**"✅ Nombre (+N)"** que le da individualmente los puntos de esa actividad en
particular (útil cuando no todos cumplen, por ejemplo, un reto semanal). Una
vez que se le da a un participante, su pastilla cambia a **"Ya cumplió"** y no
se le puede volver a acreditar por error. Pasada la hora de fin de esa
actividad, los que no alcanzaron ven **"actividad finalizada"** en vez del
botón — esto es independiente por actividad, así que una puede vencer
mientras otra sigue activa.

Editar una actividad existente (cambiar nombre/puntos/fechas) NO reinicia
quién ya la completó — solo crear una actividad nueva empieza su conteo desde
cero.

La página pública muestra una tarjeta con cronómetro en vivo por cada
actividad activa (tiempo restante, o el aviso de que ya terminó).

Es un login simple pensado para uso interno del equipo de campamento;
no protege información sensible ni reemplaza un backend con autenticación real.

## Cómo funciona el camino sobre el mapa

`assets/mapa.png` dibuja un camino desde el cartel **INICIO** (abajo) hasta
**CAMPAMENTO** (arriba). En `js/app.js`, el arreglo `PATH_POINTS` describe
ese camino como una serie de coordenadas en **porcentaje** (no en píxeles
fijos), en el orden inicio → campamento.

Cada participante se posiciona sobre el camino según:

```
progreso = puntos_del_participante / CONFIG.META_PUNTOS
```

`CONFIG.META_PUNTOS` (en `js/app.js`) es el puntaje necesario para llegar
al campamento (5000 por defecto). Al llegar a esa meta, el participante
queda marcado visualmente como **ganador** (brillo dorado + 🏆 en su
personaje y en el ranking). Si tu campamento maneja otro rango de puntos,
solo cambia ese número (cuanto más bajo, más rápido se ve a la gente
repartida por todo el camino en vez de amontonada cerca de INICIO).

Los 18 puntos de `PATH_POINTS` no son una estimación a ojo: se extrajeron
analizando los píxeles reales de `assets/mapa.png` (detectando el color del
camino y trazando su línea central de punta a punta), así que siguen la
curva real con precisión. Si el mapa cambia en el futuro, hay que repetir
ese análisis (o ajustar los puntos a mano) para que sigan la nueva forma;
el resto del código no necesita tocarse.

### Carriles (lanes): por qué nadie queda superpuesto

La posición de cada participante no depende SOLO de su progreso: también
depende de su **carril** (`lane`, un número de 1 a 12) que se le asigna una
sola vez al crearse (en `js/data.js`, función `addParticipante`) y que nunca
cambia. Un carril es una copia del camino central desplazada unos cuantos
píxeles hacia un lado, así que dos participantes con el mismo puntaje quedan
uno al lado del otro (cada uno en su propio carril) en vez de superpuestos.

Si hay más de 12 participantes, los carriles se reutilizan cíclicamente
(carril más bajo disponible; si los 12 están ocupados, se repite el ciclo).
Para el caso límite de que a dos les toque el mismo carril reutilizado con
un puntaje casi idéntico, `js/app.js` (`calcularPosicionesPorLane`) los
separa un poco más y usa el mismo parpadeo de siempre para que se note quién
es quién.

## Cómo se muestra el nombre

- En el **mapa**, cada personaje solo muestra sus **iniciales** (letra del
  nombre + letra del "segundo nombre o apellido", ej. "Jose Armando" → "JA")
  — deja más espacio libre en el camino.
- En el **ranking**, se muestra "Nombre + inicial del último apellido"
  (ej. "Jose G."), para identificar mejor a cada quien en esa lista.
- En el **admin**, siempre se ve y edita el nombre completo tal cual se
  guardó.

## Personaje animado (sprite) en el mapa

Cada participante aparece en el mapa como un personaje tipo videojuego (no
un pin con foto), con tres comportamientos:

- **Parado / deambulando**: mientras no le cambian los puntos, de vez en
  cuando (en un momento aleatorio, distinto por persona) camina unos pasos
  hacia un lado y vuelve a su línea, como si explorara alrededor de su
  lugar en el camino.
- **Caminando hacia su nueva posición**: en cuanto le cambian los puntos,
  vuelve primero a su línea (si estaba deambulando) y después camina de
  verdad, en cámara lenta, desde donde está hasta su nueva posición sobre
  el camino — la velocidad es fija: **cada 100 puntos de diferencia son 30
  segundos caminando** (`MS_POR_CADA_100_PUNTOS` en `js/app.js`).
- **Celebrando**: al llegar a la meta (`CONFIG.META_PUNTOS`), en vez de
  quedar parado se queda saltando con los brazos arriba, como festejando.
  Todos los que ya llegaron se agrupan cerca de la puerta del campamento
  (no seguían su carril ahí: justo en ese tramo el camino es muy diagonal,
  y el carril los mandaba fuera de la imagen, hacia el cielo).

- Las hojas de sprites están en `assets/sprites/` — una imagen compacta por
  género y color de participante (`masculino-{color}.png` /
  `femenino-{color}.png`, sin el `#`), generadas a partir de
  `assets/sprites/originales/{masculino,femenino}.png` (spritesheets estilo
  LPC). Cada imagen ya trae la polera pintada del color exacto de ese
  participante — no se recolorea en el navegador, así que no hay que
  procesar nada en vivo.
- Cada participante tiene un campo **`genero`** (`"masculino"` o
  `"femenino"`), elegido al crearlo desde el admin (por defecto "Hombre" si
  no se cambia) y editable después con el selector que aparece junto a sus
  puntos en la lista de participantes del admin. `spriteUrl()` en
  `js/app.js` usa ese campo para elegir qué hoja de sprites mostrar.
- Si se agrega un color de participante que no tenga su archivo generado en
  `assets/sprites/` (para alguno de los dos géneros), hay que regenerarlo
  (ver el proceso de recolor por matiz usado para los actuales, en el
  historial de cambios).

## Fotografías de participantes

Se usan en el **ranking** y en el **panel admin** (no en el mapa, que ahora
usa el personaje animado). Se suben desde el panel admin y se guardan como
`data:` URL dentro de Firestore. Si una foto no existe o no carga,
automáticamente se muestran las iniciales del nombre sobre un círculo de
color.

## Base de datos: Firebase Firestore

Toda la app llama a los datos a través de `DataService` (`js/data.js`), que
por dentro usa **Firebase Firestore** en vez de LocalStorage — así todos los
dispositivos ven exactamente los mismos datos, en tiempo real (vía
`onSnapshot`), sin depender del navegador de cada quien.

- `js/data.js` se carga como módulo (`<script type="module">`) porque el SDK
  de Firebase se importa directo desde su CDN (`gstatic.com`), sin necesidad
  de `npm` ni herramientas de build.
- Estructura en Firestore: colección `participantes` (un documento por
  participante) + colección `actividades` (un documento por cada actividad
  activa; puede haber varias al mismo tiempo).
- La primera vez que la base de datos está vacía, se siembra automáticamente
  con `data/participantes.json`.
- Las claves de `firebaseConfig` dentro de `data.js` no son secretas — están
  pensadas para ir en código público del navegador. Lo que sí protege el
  acceso son las **reglas de seguridad de Firestore** (configuradas en la
  consola de Firebase, no en este repo).

**Nota de seguridad:** como el login del admin es simple (usuario/contraseña
fijos en el propio código, sin autenticación real), las reglas de Firestore
quedan abiertas para lectura y escritura — el nivel de protección es similar
al que había antes con LocalStorage, solo que ahora compartido entre todos
los dispositivos. Si más adelante se quiere cerrar más el acceso, habría que
agregar autenticación real de Firebase (por ejemplo email/contraseña) y
reglas que exijan `request.auth != null`.

## Notas de diseño

- Mobile-first: se diseñó primero para pantallas pequeñas y se adapta
  a tablet (`700px`) y escritorio (`1024px`, mapa y ranking lado a lado).
- El mapa (`assets/mapa.png`) nunca se modifica ni se dibuja nada encima
  del camino; los avatares son elementos HTML posicionados con
  `position: absolute` y coordenadas en porcentaje.
- Al aumentar los puntos de un participante, su avatar se desliza
  suavemente por el camino (transición CSS) y aparece un pequeño efecto
  de brillo (✨) al llegar a su nueva posición.
