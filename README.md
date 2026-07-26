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
│   ├── data.js           Capa de datos (LocalStorage, lista para Firebase)
│   ├── app.js             Lógica de la página pública
│   ├── admin.js           Lógica del panel administrador
│   └── auth.js            Login simple del admin
├── assets/
│   ├── mapa.png          Mapa del camino (NO se modifica)
│   ├── logo.png           Logo opcional (si no existe, se usa un badge CSS)
│   └── avatars/           Fotos de participantes (opcional; se usan iniciales si faltan)
├── data/
│   └── participantes.json  Datos semilla (se cargan la primera vez a LocalStorage)
└── README.md
```

## Cómo abrir el proyecto

Como `data.js` usa `fetch()` para cargar la semilla la primera vez, hay que
servir los archivos con un servidor local (no funciona con doble clic en
`index.html` por las restricciones de `file://`). Por ejemplo:

```bash
cd actividades-camp
python3 -m http.server 8080
```

Luego abre `http://localhost:8080/index.html`.

## Acceso administrador

- URL: `admin.html` (o el botón ⚙️ flotante en la esquina de la página pública)
- Usuario: `admin`
- Contraseña: `camp2027`

## Actividad: inicio/fin y "Cumplió"

La actividad actual puede tener un **inicio** y un **fin** opcionales (fecha y
hora). Mientras la actividad esté activa, cada participante tiene un botón
**"✅ Cumplió (+N)"** que le da individualmente los puntos de esa actividad
(útil cuando no todos cumplen, por ejemplo, un reto semanal). Una vez que se
le da a un participante, su botón cambia a **"Ya cumplió"** y no se le puede
volver a acreditar por error. Pasada la hora de fin, los que no alcanzaron
muestran **"Actividad finalizada"** en vez del botón.

Al guardar una actividad nueva (cambiar nombre/puntos/fechas) se reinicia
quién la ha cumplido: cada actividad (semana) empieza su propio conteo desde
cero.

La página pública muestra un cronómetro en vivo con el tiempo restante
(o el aviso de que la actividad ya terminó).

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
al campamento (100 por defecto). Si tu campamento maneja otro rango de
puntos, solo cambia ese número.

Si el mapa cambia en el futuro, solo hay que ajustar los puntos de
`PATH_POINTS` para que sigan la nueva forma del camino; el resto del
código no necesita tocarse.

## Fotografías de participantes

Van en `assets/avatars/` o se suben directamente desde el panel admin
(se guardan como `data:` URL dentro de LocalStorage). Si una foto no
existe o no carga, automáticamente se muestran las iniciales del nombre
sobre un círculo de color.

## Preparado para migrar a Firebase

Toda la app llama a los datos a través de `DataService` (`js/data.js`),
y cada método ya es `async`/devuelve una Promesa aunque hoy lea y escriba
en LocalStorage de forma síncrona. Para migrar a Firebase más adelante:

1. Reemplazar el contenido interno de cada función de `js/data.js` por
   llamadas a Firestore/Realtime Database (por ejemplo `getDocs`,
   `setDoc`, `onSnapshot`, etc.).
2. Mantener los mismos nombres de función y la misma forma de los datos.
3. Ni `app.js` ni `admin.js` necesitan cambios, porque nunca acceden a
   LocalStorage directamente.
4. El listener `window.addEventListener('storage', ...)` en `app.js`
   (que hoy detecta cambios entre pestañas) se reemplazaría por el
   `onSnapshot()` de Firebase para tener actualizaciones en tiempo real
   entre distintos dispositivos, no solo distintas pestañas del mismo navegador.

## Notas de diseño

- Mobile-first: se diseñó primero para pantallas pequeñas y se adapta
  a tablet (`700px`) y escritorio (`1024px`, mapa y ranking lado a lado).
- El mapa (`assets/mapa.png`) nunca se modifica ni se dibuja nada encima
  del camino; los avatares son elementos HTML posicionados con
  `position: absolute` y coordenadas en porcentaje.
- Al aumentar los puntos de un participante, su avatar se desliza
  suavemente por el camino (transición CSS) y aparece un pequeño efecto
  de brillo (✨) al llegar a su nueva posición.
