# Vídeo automático de acciones — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un partido registrado en la app se convierta en el vídeo de acciones del portero (y otro de paradas) con dos clics de sincronización en el PC.

**Architecture:** La app del iPad gana el tipo «Balón a la espalda» y marcas de vídeo de un toque. Una herramienta local (Node sin dependencias + ffmpeg) lee la copia de seguridad de la app, calcula los clips con funciones puras y los renderiza; una página local guía los pasos.

**Tech Stack:** JavaScript ES modules (navegador y Node 22), `node --test`, ffmpeg/ffprobe, Playwright (solo pruebas).

**Spec:** `docs/superpowers/specs/2026-11-25-video-acciones-design.md`

## Global Constraints

- Sin dependencias npm en tiempo de ejecución (app y herramienta).
- Textos de interfaz en español de España.
- Las marcas (`type: 'marca'`) no cuentan en ninguna estadística.
- Ventanas por defecto (antes/después, s): tiro 10/4 · penalti 8/4 · centro 12/4 · aereo 10/4 · espalda 10/4 · salida 10/4 · pase/mano/volea/saque_puerta 4/6 · abp_def 15/5 · abp_of 8/6 · marca 12/4. Unión si el hueco ≤ 1 s.
- Salida 1920×1080, 30 fps, H.264 (`-preset veryfast -crf 21`) + AAC 48 kHz estéreo; fundido 0,25 s.
- Nombres: `Vídeo Análisis <Portero> vs <Rival> J<n>.mp4` y `PARADAS <Portero> vs <Rival> J<n>.mp4` (sin ` J<n>` si no hay jornada).
- El servidor escucha solo en 127.0.0.1:8765 y solo sirve archivos bajo las carpetas permitidas.
- `sw.js` VERSION = `1.3.0`.

## Review Focus

- Vídeo sin pista de audio → los clips deben llevar audio silencioso para que la concatenación funcione (test en Task 4: args incluyen `anullsrc` cuando `hasAudio=false`).
- Acción con instante fuera del vídeo (pitido mal marcado) → se descarta con aviso, no rompe (test en Task 3).
- Rutas con espacios, tildes y apóstrofos (`VÍDEO ANÁLISIS`, `L'Escala`) → se pasan como argumentos sin shell y los rótulos por `textfile` (test en Task 4 con rival `L'Escala` y la prueba de extremo a extremo de Task 6).
- Editar desde el registro una marca (no pertenece a ninguna pestaña) → no debe fallar (Task 2, e2e).
- Copia de seguridad con partidos sin acciones del portero elegido → lista vacía con mensaje, no error (Task 3).

---

### Task 1: Tipo «Balón a la espalda» y exclusión de marcas en estadísticas

**Files:** Modify `js/catalog.js`, `js/logic.js`, `js/ui/report.js`, `js/ui/season.js`; Test `tests/logic.test.js`, `tests/catalog.test.js`

**Interfaces:**
- Produces: `TYPES.espalda` (pasos `punto`★ pitch, `decision`★ sale/se_queda, `accion` si sale: pie/cabeza/controla/blocaje/entrada/no_llega, `resultado`★ exito/fallo, `valoracion`); `TYPES.marca` (paso opcional `etiqueta`: colocacion_centro/finalizacion/otra; no está en `TABS`); `matchStats(...).espalda` con la forma de `crosses`; `perHalf` sin marcas.

- [ ] Tests: `matchStats` con dos `espalda` (sale+exito+correcta, se_queda+fallo) → `espalda.n=2`, `intervention.value=0.5`, `success.value=1`; una `marca` en la 1.ª parte no altera `perHalf` ni ningún total; `TABS` defensa incluye `espalda`; `marca` no está en ninguna pestaña.
- [ ] Implementar; informe: fila «Balón a la espalda» en «Juego aéreo y salidas»; temporada: fila «Espalda: % intervención».
- [ ] `npm test` en verde; commit.

### Task 2: Botón «🎬 Marcar» en el registro

**Files:** Modify `js/ui/register.js`, `js/ui/report.js` (resultado de marca = etiqueta), `styles.css`, `sw.js` (1.3.0); Test `e2e/register-live.mjs`, `e2e/lib.mjs` (lanzar Chrome desde `CHROME_PATH` si existe)

- [ ] e2e: con un tiro a medias, pulsar «🎬 Marcar» guarda una marca (log +1) sin perder el tiro en curso; tocar «Finalización sin tiro» en el aviso la etiqueta; tocar la marca en el registro abre su edición sin error.
- [ ] Implementar: guarda `{type:'marca', half, t: floor(now()), attrs:{}}` directamente en la BD; aviso flotante 6 s con las tres etiquetas (cada una actualiza y guarda la marca); al editar una marca no se cambia de pestaña; elegir etiqueta en el borrador de marca guarda.
- [ ] e2e en verde; commit.

### Task 3: Lógica de clips (pura)

**Files:** Create `video/clips.js`; Test `tests/video-clips.test.js`

**Interfaces:**
- Consumes: `TYPES`, `TABS` de `js/catalog.js`; `minuteLabel` de `js/logic.js`.
- Produces:
  - `VENTANAS` (objeto tipo → `[antes, despues]`).
  - `actionLabel(action) → string` p. ej. `"23' · Tiro / parada · Blocaje"`; marca: `"23' · Marca · Finalización sin tiro"` o `"23' · Marca"`.
  - `buildClips(actions, {kick1, kick2, duration, ventanas?}) → {clips, descartadas}`; `clip = {start, end, actions:[{id,type,label,at}], include:true}` con `at` relativo al inicio del clip; ordenados por `start`; unidos si hueco ≤ 1 s; recortados a `[0, duration]`.
  - `orderClips(clips, modo) → clips` (`'crono'` | `'bloques'`: Defensa, Distribución, ABP, Marcas).
  - `isParada(action) → boolean` (tiro con blocaje/rechace_seguro/rechace_peligroso/corner, o penalti con parada).
  - `outputNames({portero, rival, jornada}) → {acciones, paradas}`.
- [ ] Tests: instante = kick de su parte + t − antes; unión de dos tiros a 5 s; acción fuera del vídeo va a `descartadas`; recorte en 0; orden por bloques; nombres con y sin jornada (`Vídeo Análisis Jona vs L'Escala J12.mp4`).
- [ ] Implementar; tests en verde; commit.

### Task 4: Render con ffmpeg

**Files:** Create `video/render.js`; Test `tests/video-render.test.js`

**Interfaces:**
- Produces:
  - `clipArgs({video, start, dur, hasAudio, labels:[{text,file,from,to}], out}) → string[]` (argumentos de ffmpeg; rótulos por `textfile=` relativos al directorio de trabajo; `font.ttf` relativo).
  - `titleArgs({lines:[file...], out, dur=3}) → string[]`.
  - `probe(video) → Promise<{duration, hasAudio, width, height}>`.
  - `renderJob({video, clips, paradas, title, outAcciones, outParadas, onProgress}) → Promise<{acciones, paradas}>`: codifica cada clip una vez en un directorio temporal, concatena con `-f concat -c copy -movflags +faststart`, reutiliza los clips para el vídeo de paradas, borra el temporal.
  - `findFont() → string` (Windows `C:\Windows\Fonts\arialbd.ttf`, luego Arial, luego DejaVu Sans Bold).
- [ ] Tests (sin ejecutar ffmpeg): `clipArgs` con `hasAudio=false` incluye `anullsrc`; incluye `-ss` antes de `-i`; el filtro contiene `fade=t=out:st=<dur-0.25>`; un `drawtext` por rótulo con `enable='between(t,from,to)'`.
- [ ] Implementar; commit.

### Task 5: Servidor local y página

**Files:** Create `video/servidor.mjs`, `video/ui/index.html`, `video/ui/app.js`, `video/ui/estilos.css`, `video/config.ejemplo.json`, `Abrir herramienta de video.cmd`

**Interfaces (HTTP, JSON):**
- `GET /api/estado-inicial` → `{ffmpeg:boolean, videos:[{path,name,size,mtime}], backups:[{path,name,mtime}], salidaBase}`.
- `GET /api/backup?path=` → copia validada (`validateBackup`) con `matches`, `keepers`, `actions`.
- `GET /video?path=` → streaming con `Range`.
- `POST /api/clips` `{backupPath, matchId, keeperId, kick1, kick2, videoPath}` → `{clips, descartadas, duration}`.
- `POST /api/generar` `{videoPath, backupPath, matchId, keeperId, jornada, portero, clips, orden, paradas:boolean}` → `{jobId}`; `GET /api/trabajo?id=` → `{fase, hecho, total, salidas?, error?}`; `POST /api/abrir` `{path}` abre el Explorador.
- Descubrimiento: vídeos `.mp4/.mov/.mkv` en Descargas (y carpetas de `config.json`), primero los >1 GB por fecha; copias `porteros-backup*.json` en `~/iCloudDrive` (hasta 3 niveles) y Descargas, por fecha. Salida: carpeta del portero dentro de `~/OneDrive/Escritorio/VÍDEO ANÁLISIS*` si existe (subcarpeta que contenga el nombre del portero, sin tildes ni mayúsculas; si no, `<NOMBRE>` en mayúsculas), si no Descargas.
- [ ] Prueba manual en Chrome (Playwright) con datos sintéticos: los cinco pasos se ven y el botón Generar lanza el trabajo.
- [ ] Commit.

### Task 6: Prueba de extremo a extremo, documentación y publicación

**Files:** Create `tests/video-e2e.mjs` (genera vídeo sintético con reloj impreso y copia sintética, llama a la API y comprueba duraciones y fotogramas); Modify `README.md`, `package.json` (`"video": "node video/servidor.mjs"`)

- [ ] Vídeo sintético 12 min con pitidos en 1:00 y 7:00; acciones conocidas → la salida dura portada + suma de clips (±0,5 s) y el fotograma inicial del primer clip muestra el reloj esperado.
- [ ] README: sección «Vídeo automático»; push a `main`; copiar la herramienta al PC.
