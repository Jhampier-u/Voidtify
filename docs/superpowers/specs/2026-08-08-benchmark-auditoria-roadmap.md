# Benchmark, auditoría y roadmap — agosto 2026

> Todo lo que sigue está medido contra las credenciales reales de este proyecto
> el 8 de agosto de 2026, no citado de documentación.

---

## Punto de partida: qué nos deja hacer Spotify hoy

Antes de comparar nada con nadie, hay que saber con qué contamos. Sondeo de la
API con el token de la app:

| Endpoint | Estado | Consecuencia |
|---|---|---|
| `/me`, `/me/top/*`, `/me/tracks`, `/me/playlists` | **200** | La base actual funciona |
| `/me/player/recently-played` | **200** | La captura sigue viva |
| `/search` | **200** | Resolución de URIs disponible |
| `/audio-features` (suelto y en lote) | **403** | Sin BPM, energía, valence, danceability |
| `/audio-analysis` | **403** | Sin análisis rítmico |
| `/recommendations` | **404** | Sin motor de recomendación de Spotify |
| `/artists/{id}/related-artists` | **403** | Sin grafo de artistas |
| `/browse/featured-playlists`, `/browse/categories` | **403** | Sin descubrimiento editorial |

Y en los objetos que **sí** responden, faltan campos que antes existían:

| Objeto | Campos ausentes |
|---|---|
| Artista | `genres`, `popularity`, `followers` |
| Pista | `popularity`, `preview_url` |
| Álbum | `genres` llega como `[]`, sin `label` |

Esto no es un detalle de implementación: decide qué se puede construir y qué no.
Tres de las cuatro apps del benchmark se apoyan justo en lo que devuelve 403.
Cualquier plan que las copie endpoint por endpoint nace muerto.

### El contrapeso: Last.fm sí responde

| Método | Estado | Qué aporta |
|---|---|---|
| `artist.getTopTags` | 200 | Géneros — ya lo usamos |
| `artist.getSimilar` | 200 | Sustituye a `related-artists` |
| `track.getSimilar` | 200 | Sustituye a `/recommendations` |
| `artist.getInfo` | 200 | `listeners` y `playcount` sustituyen a `popularity` |
| `tag.getTopArtists` | 200 | Descubrimiento por género |
| `artist.getTopTracks` | 200 | Entrada al catálogo de un artista |

**Last.fm deja de ser una fuente auxiliar de géneros y pasa a ser el motor de
todo lo relacional.** Es la conclusión más importante de este documento.

---

## Fase 1 — Benchmark

### stats.fm

**Propuesta de valor.** Estadísticas de escucha ilimitadas hacia atrás, con
comparativas por periodo y tarjetas compartibles.

**Cómo lo hacen.** Dos fuentes que se complementan, no una:

1. **Sondeo continuo** de `/me/player/recently-played`. La API solo devuelve las
   últimas 50 reproducciones y no pagina hacia atrás, así que la única forma de
   no perder nada es consultar con frecuencia y deduplicar.
2. **Importación del volcado GDPR** (*Extended Streaming History*), único origen
   de historial anterior al registro. De ahí salen `ms_played`, `reason_start`,
   `reason_end`, `shuffle` y `skipped`, que la API nunca expone.

Todo el cálculo es de backend sobre su propia base. `/me/top/*` lo usan como
contraste — «tu top según Spotify» frente a «tu top real» — no como fuente.

**Patrón visual.** Cifra enorme y sola, una idea por tarjeta, proporción vertical
para historias, y un dato que sorprende. Lo compartible no es el gráfico: es la
frase.

**Viabilidad.** Ya lo tenemos casi entero: captura cada 20 min, importación del
volcado (272.396 filas), tops, rachas, mapa de calor y tarjetas con `next/og`.
Lo que falta es empaquetado, no arquitectura.

### Swipify

**Propuesta de valor.** Descubrimiento tipo Tinder: suena una previa, deslizas, y
lo que te gusta va a una playlist.

**Cómo lo hacían.** `/recommendations` con semillas de artista o género, filtrado
por `audio-features` (`target_energy`, `target_valence`), y reproducción con el
`preview_url` de 30 segundos.

**Estado.** Las tres piezas están caídas: 404, 403 y campo ausente. No es
replicable copiando su arquitectura.

**Viabilidad reconstruida.** El flujo sí se puede rehacer cambiando el motor:
`track.getSimilar` y `tag.getTopArtists` generan candidatos, `/search` los
resuelve a URI, y la reproducción va por el **Web Playback SDK** (requiere
Premium) o encolando en el dispositivo activo. Y tenemos algo que Swipify no
tenía: 272.396 escuchas propias para excluir lo ya conocido y ponderar por
afinidad real.

### Sort Your Music (Paul Lamere)

**Propuesta de valor.** Tabla ordenable de la playlist por BPM, energía, valence,
acousticness; sirve para secuenciar sesiones o depurar.

**Cómo lo hace.** Enteramente sobre `/audio-features` en lotes de 100.

**Estado.** 403. No es reconstruible sobre Spotify. Cualquier promesa de «ordenar
por BPM» con esta API es falsa hoy.

**Viabilidad reconstruida.** Dos caminos, y conviene no mezclarlos:

- *Fuentes externas de propiedades acústicas*: volcados de AcousticBrainz
  (proyecto cerrado en 2022, datos aún descargables) vía MusicBrainz ID, o APIs
  de terceros. Cobertura parcial e impredecible; añade una dependencia frágil.
- *Ordenar por lo que sabemos nosotros*: veces reproducida, tasa de salto, hora
  del día en que suele sonar, primera y última vez, rachas. Esto no lo tiene ni
  stats.fm ni Sort Your Music, y es dato propio que Spotify no puede retirarnos.
  **Es la opción recomendada.**

### Receiptify

**Propuesta de valor.** Tu top en forma de recibo de supermercado. Un solo chiste
visual, ejecutado impecablemente.

**Cómo lo hace.** `/me/top/tracks` con los tres `time_range`, y render de imagen.

**Viabilidad.** Ya resuelto: `/api/card/[tipo]` con `next/og` y satori, con
fuentes estáticas. Es cuestión de añadir plantillas.

### Skiley y Chosic

Gestión de playlists (duplicados, fusión, orden) y buscador por género. La
gestión ya la cubrimos. El «género» de Chosic se apoyaba en audio features y en
el `genres` del artista: ambas caídas. Nuestro camino por etiquetas de Last.fm
es hoy más robusto que el suyo.

---

## Fase 2 — Auditoría técnica

### Seguridad y OAuth

**Verificado que está bien:**

- El `access_token` no llega a ningún componente cliente — cero apariciones en
  `.tsx`.
- Cookies de sesión gestionadas por Auth.js: `httpOnly`, `sameSite=lax`.
- `CRON_SECRET` se compara con `timingSafeEqual`, con chequeo previo de longitud.
- Las Server Actions que tocan la base llaman a `requireSession()`. Auth.js no
  las protege por sí solo: cada `"use server"` exportada es un POST público.
- El refresco distingue `invalid_grant` (revocado, no reintentar) del resto, y
  no propaga un token caduco.

**Hallazgos, por gravedad:**

1. **El `client_secret` sigue sin rotar.** Se pegó en una conversación en julio.
   Verificado hoy que sigue siendo válido: se refrescó un token con él.
   Cualquiera con ese par puede suplantar a la aplicación.
2. **No hay comprobación de identidad.** Cualquiera que complete el OAuth entra y
   ve todo el historial. Hoy da igual porque el servidor escucha solo en
   `127.0.0.1`; el día que esto vaya a un VPS es una fuga total. Hace falta lista
   blanca por `spotifyUserId` en el callback `signIn`.
3. **`spotify-actions.ts` se protege de forma implícita.** Sus once acciones no
   llaman a `requireSession()`: dependen de que `spotifyFetch` haga `auth()` y
   lance. Funciona, pero es un efecto secundario. La primera acción que haga
   trabajo antes de la llamada a Spotify quedará abierta sin que nada avise.
4. **Dos verdades sobre el token.** El JWT de sesión y `spotify_credentials`
   refrescan por separado. Spotify puede rotar el `refresh_token`; si lo hace en
   una rama, la otra se queda con uno muerto.
5. **Secretos en claro.** `refresh_token` sin cifrar en SQLite, `.env.local` sin
   cifrar. Aceptable en local; no en un VPS.
6. **`.env.local` idéntico en dos proyectos**, mismo `CRON_SECRET`. Comprometer
   uno compromete el otro.

### Límites de tasa

**Está bien:** un `IntervalThrottle` por API (250 ms Spotify, 220 ms Last.fm) con
cola FIFO única, así que da igual cuántos trabajadores concurran. Reintentos con
`Retry-After`, backoff exponencial con techo, y renuncia limpia por encima de
60 s. Los 5xx solo se reintentan en métodos idempotentes — un POST de añadir
pistas no se reintenta, que es lo correcto.

**Hallazgos:**

1. **El limitador vive en memoria de proceso.** Con dos instancias en un VPS, el
   límite efectivo se dobla. Necesita respaldo compartido o instancia única
   declarada.
2. **Sin jitter** en el backoff. Con un solo cliente da igual; con varios,
   sincroniza los reintentos.
3. **El 429 no se recuerda.** Tras un `Retry-After` largo se lanza el error, pero
   la siguiente petición vuelve a intentarlo de inmediato.

### Rendimiento

1. **Paginación secuencial.** `getAllMyPlaylists` encadena páginas de 50 en
   serie; con el limitador a 250 ms, mil playlists son veinte peticiones y cinco
   segundos de espera pura. Se puede solapar respetando la cola.
2. **El relleno de géneros exige pulsar un botón varias veces.** No hay trabajo
   en segundo plano, así que la caché se queda a medias en la práctica.
3. **La caché de géneros no caduca.** `artist_genres` guarda `fetched_at` pero
   nada lo revisa.
4. **Colisión de `dedup_key`.** La clave es `ts:uri` y Spotify redondea `ts` al
   segundo: dos reproducciones distintas de la misma pista en el mismo segundo
   se funden. Costó 5.286 escuchas reales en la importación (decisión D10).
5. **Redis no hace falta todavía.** SQLite con los índices actuales responde de
   sobra sobre 272.396 filas. Introducirlo ahora sería complejidad sin problema.

---

## Fase 3 — Roadmap

Ordenado por relación entre valor y riesgo.

### 1. Blindaje previo al VPS

*Por qué primero:* todo lo demás aumenta la superficie expuesta.

- Rotar el `client_secret`; mover `.env.local` a secretos del sistema.
- Lista blanca de `spotifyUserId` en el callback `signIn`.
- `requireSession()` explícito en las once acciones de `spotify-actions.ts`.
- Unificar el refresco: que el JWT lea y escriba en `spotify_credentials`.
- HTTPS con dominio real, que además resuelve el problema del loopback y permite
  retirar `proxy.ts` y el parche de `redirect_uri`.

### 2. Ordenación de playlists por historia propia

*El sustituto honesto de Sort Your Music.*

- **Datos:** ninguno nuevo. Todo sale de `streams`.
- **Modelo:** vista por `track_key` con veces reproducida, tasa de salto, hora
  modal, primera y última vez, y días desde la última.
- **Flujo:** la tabla de playlist ya existe; se le añaden columnas ordenables que
  cruzan las pistas con esa vista por `track_key`.
- **Escritura:** reordenar con `/playlists/{id}/items` (ya implementado).
- **Diferenciador:** ordenar por «lo que más saltas» o «lo que no suena desde
  hace un año» no lo puede ofrecer ninguna app del benchmark, porque ninguna
  tiene tu historial completo.

### 3. Descubrimiento interactivo con motor Last.fm

- **Candidatos:** `track.getSimilar` sembrado con tus tops del rango, más
  `tag.getTopArtists` para explorar un género concreto.
- **Filtro:** excluir por `track_key` todo lo que ya esté en `streams` — el
  descubrimiento de verdad es lo que *no* has oído.
- **Resolución:** `/search?type=track` para obtener el URI. Cachear en una tabla
  `lastfm_resolucion` para no repetir búsquedas.
- **Reproducción:** Web Playback SDK si hay Premium; si no, encolar en el
  dispositivo activo. Nada de previas de 30 s: ya no existen.
- **Salida:** lo aceptado va a una playlist con `createPlaylistFromTracks`.

### 4. Informes por periodo y contraste temporal

- **Datos:** `top_snapshots` ya existe pero solo tiene 6 filas. Hace falta que la
  captura consolide un resumen semanal y mensual.
- **Modelo:** tabla `resumen_periodo` con clave `(tipo, periodo)` y el top
  serializado, escrita por el cron.
- **Interfaz:** «esta semana frente a la anterior», entradas nuevas, caídas, y el
  gráfico de evolución que hoy solo se ve por mes.
- **Tarjetas:** una plantilla nueva en `/api/card/[tipo]` por periodo.

### 5. Vocabulario de géneros automático

- **Arreglo previo:** el relleno de `artist_genres` debe correr en el cron, en
  lotes pequeños, en vez de depender de que alguien pulse un botón.
- **Caducidad:** releer etiquetas cuyo `fetched_at` supere los 90 días.
- **Ampliación:** guardar `listeners` y `playcount` de `artist.getInfo`, que
  sustituyen al `popularity` retirado y permiten un eje de «cuánto de nicho es lo
  que escuchas».

---

## Lo que recomiendo no hacer

- **Prometer orden por BPM o energía.** No hay fuente fiable hoy.
- **Meter Redis.** No hay un problema que resuelva a esta escala.
- **Copiar Swipify endpoint por endpoint.** Su arquitectura ya no existe.
