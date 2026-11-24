# App de análisis de porteros — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PWA para iPad que registra acciones de porteros sobre un campo táctil (en directo o en diferido viendo el vídeo en otro dispositivo, con cronómetro), y genera informe por partido y acumulado de temporada por portero.

**Architecture:** Sitio estático sin compilación. Lógica pura (cálculos, catálogo de acciones) en módulos ES testeados con `node --test`; persistencia en IndexedDB; UI en módulos por pantalla que renderizan DOM/SVG. Service worker para uso sin conexión.

**Tech Stack:** HTML/CSS/JS (ES2022 módulos), IndexedDB, SVG, Service Worker, `node:test` (Node 22), Playwright (preinstalado) para pruebas de navegador con viewport iPad (1180×820).

**Spec:** `docs/2026-11-24-analisis-porteros-design.md`

## Global Constraints

- Sin dependencias en tiempo de ejecución ni paso de build; todo funciona abierto desde un servidor estático.
- Idioma de la UI: español de España.
- Orientación horizontal iPad; objetivos táctiles ≥ 44 px.
- Coordenadas normalizadas: campo `x∈[0,1]` izquierda→derecha, `y∈[0,1]` desde la línea de gol propia (y=0, abajo) a la rival (y=1). Portería: celda `0..8` en rejilla 3×3, fila superior primero (0 = arriba-izquierda).
- Tiempo de acción: `half ∈ {1,2}` y `t` = segundos desde el pitido inicial de esa parte. Minuto mostrado: `half1 → floor(t/60)+1`, `half2 → 45+floor(t/60)+1`.
- Porcentajes siempre con n: `"67 % (4/6)"`; denominador 0 → `"— (0/0)"`.
- Línea de destino: `y<1/3 → 1`, `y<2/3 → 2`, resto `3`.
- Recordatorio de copia: al finalizar partido y si `lastBackup` > 7 días.
- Fotos de portero reducidas a 256 px lado mayor, JPEG calidad 0.85, guardadas como dataURL.

## Review Focus

1. Safari se recarga/cierra a mitad de partido en directo → el cronómetro reanuda el tiempo correcto (estado del reloj persistido como `{running, startedAt, accumulated}`) y no se pierde ninguna acción guardada. Test en Task 4.
2. En diferido se pausa/ajusta el cronómetro o se cambia de parte con acciones ya guardadas → las acciones conservan su minuto (ajustar el reloj no las altera) y se puede corregir el minuto de una acción al editarla. Test en Task 4.
3. Partido sin acciones de un tipo o portero con 0 minutos → informes muestran `— (0/0)` y por-90 `—`, nunca `NaN`/`Infinity`. Test en Task 1.
4. Importar un archivo corrupto o de otra app → se rechaza con mensaje y los datos existentes quedan intactos. Test en Task 3.
5. Foto de 12 MP desde el carrete → se reduce y guarda sin bloquear; el formulario no se rompe con HEIC no decodificable (mensaje de error). Test en Task 3 (reducción) y manejo de error en el código.

---

## File Structure

```
index.html               shell + <main id="app">
styles.css               tema oscuro, layout registro, @media print para informes
manifest.webmanifest, icon-192.png, icon-512.png, sw.js
js/logic.js              funciones puras: tiempos, línea, stats, CSV
js/catalog.js            definición de tipos de acción, pasos, opciones, mínimos
js/db.js                 IndexedDB: stores seasons, keepers, players, matches, actions, meta
js/backup.js             exportar/importar JSON, validación
js/app.js                router por hash, navegación, registro del SW
js/ui/pitch.js           SVG campo y portería 3×3, conversión toque→coords
js/ui/setup.js           temporadas, porteros (foto), plantilla
js/ui/matches.js         lista y alta/edición de partidos
js/ui/register.js        pantalla de registro (cronómetro)
js/ui/report.js          informe de partido
js/ui/season.js          acumulado de temporada y comparación
tests/logic.test.js, tests/catalog.test.js, tests/backup.test.js   node:test
e2e/*.mjs                scripts Playwright (servidor: python3 -m http.server)
README.md                publicar en GitHub Pages e instalar en iPad
```

## Data shapes (referenciadas por todas las tareas)

```js
Season  {id, name}                                   // "2026-27"
Keeper  {id, name, number, photo /*dataURL|null*/, active}
Player  {id, number, name}
Match   {id, seasonId, date /*YYYY-MM-DD*/, rival, home /*bool*/, competition,
         goalsFor, goalsAgainst,
         keepers: [{keeperId, minutes}],
         clock: {half, running, startedAt /*ms epoch|null*/, accumulated /*s*/},
         finished /*bool*/}
Action  {id, matchId, keeperId, half, t, type, points: {[stepKey]: {x,y} | cell}, attrs: {[key]: value}, note}
```
IDs: `crypto.randomUUID()`.

---

### Task 1: Lógica pura (`js/logic.js`)

**Files:** Create `js/logic.js`, `tests/logic.test.js`, `package.json` (`{"type":"module","scripts":{"test":"node --test tests/"}}`), `.gitignore`.

**Interfaces — Produces:**
- `destLine(y: number) -> 1|2|3`
- `minuteLabel(half, t) -> string` (`"12'"`, `"47'"`)
- `clockSeconds(clock, nowMs) -> number` (accumulated + elapsed si running)
- `pct(n, d) -> {n, d, value|null}`, `fmtPct(p) -> string`
- `per90(value, minutes) -> number|null`
- `matchStats(actions) -> Stats` (ver Step 1), `seasonStats(matches, actions, keeperId) -> {totals: Stats, minutes, perMatch: [{match, stats, minutes}]}`
- `toCSV(rows: object[], columns: string[]) -> string` (`;` separador, comillas dobles escapadas, BOM UTF-8 para Excel)

- [ ] **Step 1: Write failing tests** en `tests/logic.test.js`:
  - `destLine(0.1)===1`, `destLine(0.5)===2`, `destLine(0.9)===3`, `destLine(1/3)===2`.
  - `minuteLabel(1,0)==="1'"`, `minuteLabel(2,125)==="48'"`.
  - `clockSeconds({running:true,startedAt:1000,accumulated:60}, 31000)===90`; parado → `accumulated`.
  - `fmtPct(pct(4,6))==="67 % (4/6)"`, `fmtPct(pct(0,0))==="— (0/0)"`.
  - `per90(3, 0)===null`, `per90(3, 45)===6`.
  - `matchStats` con fixture: 3 tiros (gol con `evitable:'si'`, blocaje, fuera), 1 penalti gol, 2 centros (sale+exito+valoracion correcta; se_queda+valoracion debia_salir), 3 distribuciones (completado y=0.5, perdido y=0.8, segunda_ganada y=0.2):
    `shots===3, onTarget===2, saves===1, savePct.value===0.5, goals===2, goalsAvoidable===1, crosses.n===2, crosses.intervention.value===0.5, crosses.success.value===1, crosses.correctDecision.value===0.5, dist.total.value===2/3, dist.byLine[2].n===1&&dist.byLine[2].d===1, dist.byLine[3].n===0, penalties.d===1, penalties.goals===1`.
  - `matchStats([])` no contiene `NaN` (recorrer recursivamente).
  - `seasonStats`: 2 partidos con portero A (90 y 45 min) → `minutes===135`, `perMatch.length===2`; acciones de portero B excluidas.
  - `toCSV([{a:'x;y',b:'"q"'}],['a','b'])` === `"﻿a;b\n\"x;y\";\"\"\"q\"\"\"\n"`.

- [ ] **Step 2:** `npm test` → FAIL (módulo no existe).
- [ ] **Step 3: Implement** en `js/logic.js`. Reglas de `matchStats` (valores de atributo de `catalog.js`, Task 2):
  - Tiros = `type==='tiro'`. A puerta = `resultado ∈ {gol, blocaje, rechace_seguro, rechace_peligroso, corner}`. Paradas = a puerta − gol. `savePct = pct(saves,onTarget)`.
  - `goals` = tiros gol + penaltis gol; `goalsAvoidable` / `goalsDebatable` por `attrs.evitable` (`si`/`discutible`).
  - `crosses` (tipo `centro`) y `aerial` (tipo `aereo`), misma forma: `intervention=pct(sale,n)`, `success=pct(exito, sale)`, `correctDecision=pct(valoracion==='correcta', conValoracion)`.
  - `oneVone` (tipo `salida`): `success=pct(exito,n)`, `correctDecision` igual.
  - `dist` (tipos `pase`,`mano`,`volea`,`saque_puerta`): éxito = `completado|segunda_ganada`; `total`, `byLine{1,2,3}` (de `points.destino.y`), `byHeight{raso,media,alto}`, `byPressure{sin,media,alta}`, `byType{…}`, cada uno `pct`.
  - `penalties`: `pct(paradas, n)` como `{n:saves,d}`, `goals`, `guessed=pct(adivina, conLadoPortero)` donde adivina = columna de `points.lanzamiento` (cell%3) === `attrs.lado_portero` (`izq=0,centro=1,der=2`).
  - `perHalf: {1: count, 2: count}`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** `git add -A && git commit -m "feat: lógica de estadísticas y tiempos"`

### Task 2: Catálogo de acciones (`js/catalog.js`)

**Interfaces — Produces:**
- `TABS: [{key:'defensa'|'distribucion'|'abp', label, types:[typeKey]}]`
- `TYPES: {[typeKey]: {label, steps: Step[]}}` con `Step = {key, label, kind:'pitch'|'goal'|'choice'|'receptor', options?: [{value,label}], required:bool}`
- `missingRequired(type, action) -> string[]` (keys de pasos obligatorios vacíos)

Tipos y pasos (★ = required), valores en snake_case sin tildes:
- `tiro`: `origen`(pitch★), `posicion_portero`(pitch), `porteria`(goal★), `superficie`(pie_d,pie_i,cabeza,otra), `contexto`(posicional,contraataque,abp,uno_vs_uno), `desviado`(si,no), `tecnica`(blocaje,desvio,estirada,pies,mano_cambiada,otra), `resultado`★(gol,blocaje,rechace_seguro,rechace_peligroso,corner,fuera_poste), `evitable`(si,no,discutible — solo visible si resultado=gol: `showIf:{resultado:'gol'}`).
- `centro` y `aereo`: `origen`(pitch★), `caida`(pitch), `trayectoria`(bombeada,tensa,rasa,segundo_palo), `decision`★(sale,se_queda), `accion`(blocaje,despeje_1,despeje_2,desvio,no_llega; showIf decision=sale), `resultado`★(exito,fallo), `valoracion`(correcta,debia_salir,no_debia_salir).
- `salida`: `punto`(pitch★), `accion`(pie,cabeza,entrada,bloqueo,temporizacion), `resultado`★(exito,fallo), `valoracion`(correcta,debia_salir,no_debia_salir).
- `pase`,`mano`,`volea`,`saque_puerta`: `origen`(pitch★), `destino`(pitch★), `altura`(raso,media,alto), `pierna`(d,i; no en `mano`), `presion`(sin,media,alta), `receptor`(receptor), `resultado`★(completado,perdido,segunda_ganada,segunda_perdida).
- `abp_def`: `subtipo`★(corner,falta_lateral,falta_frontal), `posicion_portero`(pitch), `barrera`(choice 0..6, showIf subtipo≠corner), `intervencion`★(ninguna,tiro,centro). Si `tiro`/`centro`, al guardar la UI abre ese flujo con `attrs.contexto='abp'`/`attrs.desde_abp=true`.
- `penalti`: `lanzamiento`(goal★), `lado_portero`(izq,centro,der), `resultado`★(gol,parada,fuera_poste).
- `abp_of`: `participacion`★(saque,otra), `resultado`(exito,fallo).
Tabs: defensa=[tiro,centro,aereo,salida], distribucion=[pase,mano,volea,saque_puerta], abp=[abp_def,penalti,abp_of].

- [ ] **Step 1: Failing tests** `tests/catalog.test.js`: cada tipo de cada TAB existe en TYPES; `missingRequired('tiro',{points:{},attrs:{}})` deep-equals `['origen','porteria','resultado']`; con todos rellenos → `[]`; todo `options` value único dentro de su paso; `evitable` tiene `showIf`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS. **Step 5:** commit `feat: catálogo de acciones`.

### Task 3: Persistencia, copia de seguridad y configuración

**Files:** Create `js/db.js`, `js/backup.js`, `tests/backup.test.js`, `index.html`, `styles.css`, `js/app.js`, `js/ui/setup.js`, `e2e/setup.mjs`.

**Interfaces — Produces:**
- `db.js`: `open()`, `all(store)`, `get(store,id)`, `put(store,obj)`, `del(store,id)`, `actionsOf(matchId)` (índice `matchId`), `getMeta(key)`, `setMeta(key,val)`, `replaceAll(data)` (una transacción sobre todos los stores; si falla, aborta sin tocar nada). Stores: `seasons, keepers, players, matches, actions, meta`. Al abrir: `navigator.storage?.persist?.()`.
- `backup.js`: `buildBackup(data) -> {app:'porteros', version:1, exportedAt, ...data}`; `validateBackup(obj) -> string|null` (mensaje de error o null: exige `app==='porteros'`, `version===1`, y arrays `seasons,keepers,players,matches,actions`, cada acción con `matchId` existente en matches); `exportBackup()` descarga `porteros-backup-YYYY-MM-DD.json` y `setMeta('lastBackup', Date.now())`; `importBackup(file)` → valida → `confirm()` → `replaceAll`.
- `app.js`: router hash `#/`, `#/setup`, `#/match/:id/register`, `#/match/:id/report`, `#/season`; `render(el)` por pantalla; banner de copia si `lastBackup` > 7 días o nunca y hay partidos.
- `setup.js`: CRUD temporadas (marcar activa en meta `activeSeason`), porteros (nombre, dorsal, foto, activo), plantilla (dorsal, nombre). Foto: `resizeImage(file, 256) -> Promise<dataURL>` vía `createImageBitmap` + canvas, `toDataURL('image/jpeg',0.85)`; error de decodificación → mensaje "No se pudo leer la imagen (prueba con JPG/PNG)".

- [ ] **Step 1: Failing tests** `tests/backup.test.js`: `validateBackup(null)`, `({})`, `({app:'otra',version:1})`, backup sin `actions`, acción con `matchId` inexistente → string no vacío; backup válido mínimo → `null`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar `backup.js` (funciones puras testeables sin DOM), `db.js`, shell, `setup.js`.
- [ ] **Step 4:** `npm test` PASS.
- [ ] **Step 5: E2E** `e2e/setup.mjs` (Playwright, viewport 1180×820, `python3 -m http.server 8123`): crear temporada, crear portero con foto de 4000×3000 generada en canvas → `img` del portero con `naturalWidth<=256`; recargar → portero persiste; importar archivo `{"foo":1}` → mensaje de error visible y portero sigue existiendo. Run `node e2e/setup.mjs` → imprime `OK`.
- [ ] **Step 6:** commit `feat: almacenamiento, copias y configuración`.

### Task 4: Partidos y registro en directo

**Files:** Create `js/ui/pitch.js`, `js/ui/matches.js`, `js/ui/register.js`, `e2e/register-live.mjs`; Modify `styles.css`, `js/app.js`.

**Interfaces:**
- Consumes: `TABS, TYPES, missingRequired` (Task 2); `clockSeconds, minuteLabel, destLine` (Task 1); `db.*` (Task 3).
- Produces: `pitchSVG({points, onTap}) -> SVGElement` (campo vertical, portería propia abajo, líneas punteadas en y=1/3 y 2/3, onTap recibe `{x,y}` normalizados con `getBoundingClientRect`); `goalSVG({cell, onTap}) -> SVGElement` (3×3); `drawMarkers(svg, points)`.
- `matches.js`: lista de partidos de la temporada activa (fecha desc) con acceso a Registrar / Informe / Borrar (confirm); alta: fecha, rival, local, competición, porteros con minutos (por defecto 90), once opcional (selección de plantilla).
- `register.js` (layout spec §5.3): cabecera (rival, marcador editable, reloj, Iniciar/Pausa, 1.ª/2.ª parte, Finalizar, Informe); pestañas; botones de tipo; panel central muestra el paso activo (pitch/goal/opciones como botones grandes/receptor desde el once o teclado numérico); barra de pasos numerados (saltables, los ★ marcados); botón Guardar deshabilitado mientras `missingRequired` no vacío; panel derecho: portero seleccionado (foto+nombre, cambio rápido entre los del partido) y lista de acciones (minuto, tipo, resultado; tocar → editar; borrar con confirm; Deshacer la última). Al seleccionar tipo se fija `half` y `t = clockSeconds(match.clock, Date.now())`. Avance automático al siguiente paso tras cada toque. Cada guardado → `db.put('actions')` inmediato. Ajuste del reloj ±10 s / ±1 min (para cuadrar con el vídeo en diferido). Al editar una acción se puede corregir su parte y minuto. Reloj persistido en `match.clock` en cada Iniciar/Pausa/cambio de parte (cambio de parte reinicia `accumulated=0`). Finalizar → `finished=true`, aviso de copia de seguridad con botón Exportar.

- [ ] **Step 1: E2E failing** `e2e/register-live.mjs`: con datos sembrados vía `replaceAll` (temporada, portero, partido): Iniciar reloj; registrar tiro (toque campo, toque portería, resultado "Gol", evitable "Sí") → Guardar; lista muestra 1 acción con `1'`; registrar pase (origen, destino en y≈0.8, resultado completado); **recargar la página** → 2 acciones listadas y reloj sigue corriendo con tiempo ≥ el previo; Guardar está deshabilitado tras elegir tipo tiro sin toques; borrar una acción → 1 restante; ajustar reloj +1 min → el minuto de las acciones ya guardadas no cambia. Imprime `OK`.
- [ ] **Step 2:** run → FAIL. **Step 3:** implementar. **Step 4:** run → `OK`; `npm test` PASS.
- [ ] **Step 5:** captura `e2e/shots/register.png` y revisión visual (alineación, nada cortado en 1180×820 y 820×1180 no requerido). Commit `feat: registro en directo`.

### Task 5: Informe de partido

**Files:** Create `js/ui/report.js`, `e2e/report.mjs`; Modify `styles.css` (`@media print`: fondo blanco, sin navegación, saltos de página por sección, A4 horizontal).

**Interfaces:** Consumes `matchStats, fmtPct, toCSV, minuteLabel` (Task 1), `pitchSVG/goalSVG/drawMarkers` (Task 4).
- Selector de portero (si jugaron varios) o "Todos". Secciones spec §5.5, cada métrica con `fmtPct`. Mapa de tiros (color por resultado: gol rojo, parada verde, fuera gris, leyenda), portería 3×3 con conteo tiros/goles por celda, mapa de destinos de distribución (verde éxito / rojo pérdida) con origen→destino como línea. Lista de acciones (minuto, tipo, resultado, nota) para localizar cada jugada en el vídeo. Botones "PDF" (`window.print()`) y "CSV" (columnas: `fecha;rival;portero;parte;minuto;tipo;` + todas las keys de atributos de TYPES + `origen_x;origen_y;destino_x;destino_y;porteria;linea_destino;nota`).

- [ ] **Step 1: E2E failing**: con fixture sembrada (misma de Task 1 traducida a acciones), la página contiene `"50 % (1/2)"` (paradas) y `"— (0/0)"` en 1v1; descarga CSV tiene 1+9 líneas y cabecera empieza por `fecha;rival`; `page.pdf()` en emulación print no lanza. Imprime `OK`.
- [ ] **Steps 2–4.** **Step 5:** captura `e2e/shots/report.png` + PDF de muestra; revisión visual. Commit `feat: informe de partido`.

### Task 6: Acumulado de temporada

**Files:** Create `js/ui/season.js`, `e2e/season.mjs`.

**Interfaces:** Consumes `seasonStats, per90, fmtPct, toCSV`.
- Filtros: temporada, competición, local/visitante. Vista por portero: totales, por-90 (`—` si null), tabla partido a partido (fecha, rival, min, % paradas, goles, % distribución, % decisiones centros), gráfico de líneas SVG de 3 métricas (eje x partidos por fecha, puntos con n<3 en hueco). Vista comparación: tabla porteros en columnas. PDF/CSV igual que Task 5.

- [ ] **Step 1: E2E failing**: 2 porteros, 3 partidos; vista portero A muestra minutos `135`, tabla de 2 filas; portero con 0 min muestra `—` en por-90 y ningún `NaN` en `document.body.innerText`. `OK`.
- [ ] **Steps 2–4.** **Step 5:** captura + commit `feat: acumulado de temporada`.

### Task 7: PWA sin conexión, publicación y README

**Files:** Create `sw.js`, `manifest.webmanifest`, `icon-192.png`, `icon-512.png` (generados con canvas en un script Playwright, icono guante/portería simple), `README.md`; Modify `index.html` (manifest, `apple-touch-icon`, `apple-mobile-web-app-capable`), `js/app.js` (registrar SW).

- `sw.js`: precache de todos los archivos estáticos con versión `CACHE='porteros-v1'`; estrategia cache-first con actualización en segundo plano; nunca cachea `blob:`.
- README (español): crear cuenta GitHub, subir repo, activar Pages (rama `main`, raíz), abrir URL en Safari del iPad → Compartir → "Añadir a pantalla de inicio"; flujo de uso; copias de seguridad.

- [ ] **Step 1: E2E failing** `e2e/offline.mjs`: cargar app, esperar SW `ready`, `context.setOffline(true)`, recargar → la app renderiza la lista de partidos. `OK`.
- [ ] **Steps 2–4.** **Step 5:** ejecutar todos (`npm test` y cada `e2e/*.mjs`) → todo PASS/`OK`. Commit `feat: PWA offline y documentación`.
