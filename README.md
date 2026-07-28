# Ledger

Un organizador editorial para tu biblioteca de Spotify.
Lo que Spotify no te deja decir sobre tu música, dícelo tú.

> Tags personalizados · filtros por género · detector de duplicados · smart playlists · stats sobre tu biblioteca · todo con caché local para no chocar contra el rate limit de Spotify.

---

## Qué hace

- **Índice editorial** de todas tus playlists, con filtros (Tuyas / Seguidas / Colab) y un destacado.
- **Detalle de playlist** con carga lazy (no descarga 8 000 canciones de golpe), selección múltiple para mover/copiar/quitar tracks, y reordenar por drag-and-drop.
- **Detector de duplicados** dentro de cada playlist, con botón para limpiar (deja una copia de cada uno).
- **Filtros por género** y **tags personalizados** que tú creas — y un botón "Crear playlist con N canciones" que materializa cualquier filtro como una playlist real en Spotify.
- **Crear · fusionar · dividir** playlists.
- **Smart playlists** con reglas (incluir/excluir tags, géneros, fechas, límite). Pulsas "Materializar" y la playlist real se actualiza en Spotify.
- **Stats** editoriales sobre tus Liked Songs: top artistas, álbumes, géneros, evolución temporal.
- **Tags page** para administrar tu vocabulario (renombrar, color, contar).

---

## Stack

- **Next.js 16** (App Router + Turbopack)
- **TypeScript** + **Tailwind v4**
- **Auth.js v5** para OAuth con Spotify
- **SQLite + Drizzle ORM** para cache local de artistas/géneros, tags y smart playlists
- **Last.fm API** como fuente principal de géneros (Spotify deprecó esto en feb 2026)
- Sin frameworks de animación, sin shadcn, sin librerías de UI — todo a mano con un sistema editorial (Fraunces + JetBrains Mono).

---

## Setup en un PC nuevo

### 1. Pre-requisitos

- [Node.js 20+](https://nodejs.org) (LTS)
- [Git](https://git-scm.com/downloads)

### 2. Clonar e instalar

```bash
git clone https://github.com/TU_USUARIO/spotify-organizer.git
cd spotify-organizer
npm install
```

### 3. Crear tus claves de API

#### Spotify

1. Ve a [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) y haz login.
2. "Create app". Nombre cualquiera, descripción cualquiera.
3. **Redirect URI**: exactamente `http://127.0.0.1:3210/api/auth/callback/spotify` (Spotify no acepta `localhost` para apps nuevas).
4. Marca el scope **Web API**.
5. Guarda **Client ID** y **Client Secret**.

#### Last.fm

1. Ve a [last.fm/api/account/create](https://www.last.fm/api/account/create).
2. Pide una API key (es gratis, instantáneo).
3. Guarda la **API Key**.

### 4. Configurar `.env.local`

```bash
cp .env.local.example .env.local      # macOS/Linux
copy .env.local.example .env.local    # Windows
```

Edita `.env.local` y rellena:

```
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
LASTFM_API_KEY=...
AUTH_SECRET=...
AUTH_URL=http://127.0.0.1:3210
```

Para generar un `AUTH_SECRET` nuevo:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 5. Arrancar

```bash
npm run dev
```

Abre **http://127.0.0.1:3210** (no `localhost`).

---

## Qué NO se sincroniza entre PCs

| Archivo | Razón |
|---|---|
| `.env.local` | Secretos, cada máquina tiene los suyos |
| `data/ledger.db` | Cache local de artistas, tus tags, smart playlists |
| `node_modules/` | Se regenera con `npm install` |
| `.next/` | Build cache |

Si quieres compartir tags y smart playlists entre máquinas, exporta/importa el `.db` manualmente (o pásalo por backup).

---

## Captura de escuchas

La API de Spotify no guarda tu historial: solo devuelve las **últimas 50
reproducciones**. Para no perder nada hay que consultarla periódicamente.

### Variables necesarias

```
CRON_SECRET=...            # protege /api/cron/capture
STATS_TZ=America/Guayaquil # zona IANA para las estadísticas por hora y día
```

`STATS_TZ` es obligatoria y no tiene valor por defecto: una zona equivocada
produce histogramas desplazados que parecen correctos. El valor debe ser una
zona horaria **IANA** válida (p. ej. `America/Guayaquil`, `Europe/Madrid`,
`America/Lima`) — no un offset ni una abreviatura.

El **Redirect URI** del dashboard de Spotify debe ser exactamente
`http://127.0.0.1:3210/api/auth/callback/spotify` — nunca `localhost`, que
Spotify rechaza en apps nuevas. La app lo envía explícito porque Auth.js en
este fork de Next no consigue derivar el origen de la petición por sí solo.

### El puerto 3210

Voidtify escucha en el **3210**, no en el 3000. No es capricho: en la máquina
de desarrollo convivía con otra copia del proyecto que arrancaba un `next dev`
en el 3000, y cuando esa copia ganaba el puerto la captura seguía disparándose
puntual cada 20 minutos contra la app equivocada — que respondía con un error
porque su base de datos no tiene el token de Spotify. Nadie capturaba nada y
nada lo delataba. Un puerto propio elimina la clase entera de problema.

El puerto vive en tres sitios que deben coincidir: el script `dev` de
`package.json`, y la constante `PUERTO` de `scripts/capture.cmd` y
`scripts/servidor.cmd`.

### En local (Windows)

Dos tareas programadas, que se instalan de una vez en una consola de
**administrador**:

```powershell
powershell -ExecutionPolicy Bypass -File C:\Voidtify\scripts\instalar-tareas.ps1
```

| Tarea | Cuándo | Qué hace |
|---|---|---|
| `Voidtify servidor` | al iniciar sesión | levanta el servidor si no hay ninguno |
| `Voidtify captura` | cada 20 min | pide una captura al endpoint del cron |

La de captura por sí sola no basta. El servidor muere con cada apagado y no
vuelve solo, así que tras un reinicio la tarea seguía disparándose contra un
puerto muerto: la ventana parpadeaba igual y no se guardaba nada. La captura
moría en silencio hasta acordarse de arrancar el servidor a mano.

Ambas pasan por `scripts/oculto.vbs`, que ejecuta el `.cmd` **sin ventana**.
La alternativa nativa — «ejecutar tanto si el usuario inició sesión como si
no» — necesita permisos que el usuario normal no tiene.

`scripts/capture.cmd` lee `CRON_SECRET` de `.env.local` en vez de recibirlo
como argumento. Es deliberado: el parser de `schtasks` rompe con comillas
anidadas y acaba interpretando el secreto como un argumento suelto, y así
además el secreto no queda escrito en la definición de la tarea.

**Hace falta administrador** solo porque la primera versión de
`Voidtify captura` se creó con permisos elevados y quedó siendo propiedad del
grupo Administradores: el usuario normal ya no puede ni modificarla ni
borrarla. El script la reemplaza.

Los ajustes que trae la instalación, y por qué:

- **corre con batería** — el valor por defecto de Windows es no arrancar la
  tarea si el portátil está desenchufado, y no avisa. Con un portátil eso son
  horas de escuchas perdidas sin ninguna señal.
- **no se detiene al desenchufar** — misma razón, a mitad de ejecución.
- **recupera ejecuciones perdidas** — si el equipo estaba apagado a la hora
  exacta, arranca al encender en vez de esperar al siguiente múltiplo de 20.

Para probar al momento, o parar el servidor de fondo (que no tiene ventana
donde hacer Ctrl+C):

```powershell
schtasks /Run /TN "Voidtify captura"
.\scripts\parar-servidor.cmd
```

Si algo falla al arrancar, el log está en `data/servidor.log`.

### En un VPS

```bash
*/20 * * * * curl -fsX POST -H "x-cron-secret: EL_SECRETO" http://127.0.0.1:3210/api/cron/capture
```

Misma ruta y mismo código en ambos entornos.

### Estado

`/ajustes` muestra la última ejecución, cuántas escuchas van capturadas y el
último error. Avisa si la captura lleva más de dos horas sin correr o si
detecta un posible hueco.

### Por qué cada 20 minutos

La ventana de la API son 50 pistas, unas 2,5–3 h de escucha continua. Veinte
minutos deja margen de sobra incluso si el equipo estuvo suspendido, y son solo
~72 llamadas al día.

### `src/auth.ts` no recarga en caliente

Ese módulo se evalúa una sola vez al arrancar el proceso. Cambios en él —incluido
cualquier `process.env` leído a nivel de módulo, como el origen público usado
para construir el redirect URI— no se aplican con Fast Refresh: hace falta
parar `npm run dev` por completo y volver a arrancarlo. Esto costó tiempo de
depuración real dos veces durante el desarrollo de la captura. Si tocas
`auth.ts` y el comportamiento no cambia, reinicia el servidor entero antes de
sospechar de otra cosa.

---

## Limitaciones conocidas

### Spotify Web API (cambios feb 2026)

Spotify movió y removió varios endpoints. Mitigaciones aplicadas:

- `/playlists/{id}/tracks` → ahora `/playlists/{id}/items`. El cuerpo cambió a `{items: [{uri}]}` para DELETE y `{uris: [...]}` para POST/PUT.
- `GET /artists?ids=...` (bulk) removido. Usamos `/artists/{id}` (uno a uno) + Last.fm como fallback.
- El campo `genres` en `/artists/{id}` está deprecado y casi siempre devuelve `[]`. Por eso priorizamos Last.fm tags.
- Apps en **Development Mode** solo pueden leer canciones de playlists propias. Las playlists seguidas/curadas muestran solo metadatos.

### Rate limits

Spotify es agresivo con apps en Dev Mode (~180 req / 30 s). Implementaciones para no chocar:

- **Rate limiter global** (`src/lib/rate-limiter.ts`) que serializa todas las peticiones a 4 req/s.
- **Cache local** de artistas/géneros con TTL de 30 días.
- **Cache de Liked Songs** completo en SQLite — las stats salen del cache, no de Spotify.
- **Lazy loading** en playlists grandes (carga 100, pide más on demand).
- **Reintento con backoff** en 429, con tope de 60 s.

Si Spotify aún así te castiga con cooldown de varias horas, no hay nada que hacer — espera.

### Extended Quota Mode

Para uso casual personal, Development Mode es suficiente. Si quieres más volumen o eliminar restricciones, aplica a Extended Quota desde el dashboard de Spotify (revisión manual, semanas, puede ser rechazado).

---

## Estructura

```
src/
  app/                   # Next.js App Router pages
    page.tsx               # Home — índice de playlists
    library/page.tsx       # Liked Songs paginados
    playlist/[id]/page.tsx # Detalle de playlist
    stats/page.tsx         # Stats sobre la biblioteca
    tags/page.tsx          # Administración de tags
    smart/page.tsx         # Smart playlists
    debug/page.tsx         # Diagnóstico de endpoints

  components/            # UI components (client + server)
  lib/
    spotify.ts             # Cliente Spotify + tipos
    spotify-actions.ts     # Server actions (CRUD playlists, tracks)
    genre-actions.ts       # Enriquecimiento de géneros (hybrid)
    tag-actions.ts         # CRUD de tags
    smart-actions.ts       # CRUD + materialize smart playlists
    liked-cache.ts         # Cache de Liked Songs en SQLite
    smart-rules.ts         # Evaluación pura de reglas
    rate-limiter.ts        # Throttle global
    lastfm.ts              # Cliente Last.fm

  db/
    index.ts               # Conexión SQLite + auto-create tables
    schema.ts              # Drizzle schemas

  auth.ts                # Auth.js config (Spotify provider)
```

---

## Estética

Tema "editorial / vinyl liner notes" — referencias: Pitchfork, revistas alemanas de diseño, notas internas de un vinilo de jazz.

- Tipografía: **Fraunces** (serif variable, italic display) + **JetBrains Mono** (metadatos, números, labels)
- Paleta: ink (#0c0a09) sobre cream (#f4ede4), acento chartreuse (#d2ff3a) sin tirar a Spotify-green
- Grain sutil sobre todo, hairline dividers, badges mono, animaciones discretas

---

## Licencia

Uso personal. Sin licencia formal — código privado de Aslan.
