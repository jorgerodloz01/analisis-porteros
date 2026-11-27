# Análisis Porteros

App web para iPad que registra las acciones de tus porteros durante un partido, tanto en directo como en diferido, y genera un informe por partido y el acumulado de la temporada. Es gratuita, funciona sin conexión y los datos se guardan solo en tu iPad.

## 1. Publicarla (una sola vez, gratis)

1. Crea una cuenta en [github.com](https://github.com) si no la tienes.
2. Crea un repositorio nuevo, por ejemplo `analisis-porteros`, con visibilidad **Public**. GitHub Pages es gratis en repositorios públicos. El código queda público, pero tus datos no, porque nunca salen del iPad.
3. Sube el contenido de esta carpeta al repositorio. Puedes usar «Add file → Upload files» y arrastrar todos los archivos y carpetas, o `git push`.
4. En el repositorio, ve a **Settings → Pages**. En «Build and deployment», elige «Deploy from a branch», rama `main` y carpeta `/ (root)`, y pulsa **Save**.
5. En 1 o 2 minutos tendrás la dirección `https://TU-USUARIO.github.io/analisis-porteros/`.

## 2. Instalarla en el iPad

1. Abre esa dirección en **Safari** (tiene que ser Safari).
2. Pulsa **Compartir** y luego **Añadir a pantalla de inicio**.
3. Ábrela desde el icono. Se abre a pantalla completa y, tras la primera carga, funciona **sin conexión**.

## 3. Uso

1. **Configuración**: añade tus porteros (nombre, dorsal y foto) y, si quieres, la plantilla con dorsales para elegir el receptor de los pases. La temporada se crea sola.
2. **Partidos → Nuevo partido**: indica la fecha, el rival, la condición de local o visitante, la competición, los porteros con sus minutos jugados y el once (opcional).
3. **Registro**:
   - **Iniciar** arranca el cronómetro. Cambia de parte con los botones **1.ª parte / 2.ª parte**. Los botones ±10″ y ±1′ sirven para cuadrar el reloj con el partido o con el vídeo en diferido; puedes pausarlo cuando pauses el vídeo.
   - Elige la pestaña (Defensa / Distribución / ABP) y el tipo de acción. Toca en el campo o la portería y elige las opciones. Cada toque avanza al siguiente paso.
   - Los pasos con ★ son obligatorios y el resto puedes saltarlos. Pulsa **Guardar**.
   - El minuto se toma al elegir la acción. Puedes corregirlo con el botón ⏱ (admite añadido: `45+2`, `90+3`).
   - **Balón a la espalda** (pestaña Defensa): registra los pases a la espalda de la defensa con la decisión (sale / se queda), igual que los centros. Sale en el informe y en la temporada.
   - **🎬 Marcar** (abajo a la izquierda): un toque guarda el instante para el vídeo sin interrumpir lo que estés registrando. Aparece un aviso para etiquetarla (colocación en centro, finalización sin tiro, otra). Las marcas **no cuentan en las estadísticas**; sirven para que esas jugadas salgan en el vídeo.
   - **↶ Deshacer última** borra la última acción guardada. Si cambias de acción con datos sin guardar, la app te pregunta antes de descartarlos.
   - La portería y el lado del penalti se registran **vistos desde el campo**, como en la imagen de la TV.
   - Para editar una acción, tócala en el registro de la derecha. Para borrarla, pulsa ✕.
   - Al guardar un gol, el marcador en contra se actualiza solo. Los goles a favor se suman con +.
4. **Informe**: muestra las estadísticas, los mapas y la lista de acciones con su minuto. **PDF** abre la impresión de Safari, desde donde puedes «Guardar en Archivos» o compartirlo. **CSV** descarga los datos para Excel.
5. **Temporada**: muestra el acumulado por portero (totales, métricas por 90 minutos y evolución partido a partido) y la comparación entre porteros, con filtros por competición y condición.

**Antes de empezar la temporada**, revisa y ajusta los **[criterios operativos de registro](docs/criterios-operativos.md)**: qué cuenta como gol evitable, presión alta, rechace peligroso, etc. Fijarlos de antemano es lo que hace comparables los datos de todos los partidos.

## 4. Copias de seguridad (importante)

Los datos viven **solo en este iPad**, en el almacenamiento de Safari. Si borras los datos de Safari, desinstalas la app o pierdes el iPad, se pierden.

- Al **Finalizar** un partido, la app te propone exportar una copia. Se abre «Compartir»: elige **Guardar en Archivos** (mejor en iCloud Drive). La copia solo se da por hecha si la guardas.
- En **Configuración → Copia de seguridad** puedes exportar o importar cuando quieras. Al importar se **sustituyen** todos los datos actuales.
- Si pasan más de 7 días sin copia, aparece un aviso.

## 5. Actualizaciones

Cada vez que publiques cambios en el código, **sube el número `VERSION` de `sw.js`** (por ejemplo, de `1.1.0` a `1.1.1`). El iPad descarga la versión nueva completa en segundo plano y la usa **a partir de la siguiente vez** que abras la app. Si no cambias `VERSION`, el iPad seguirá usando la versión anterior.

## 6. Vídeo automático del portero (en el PC)

Convierte un partido registrado en la app en el vídeo con todas las acciones del portero, rotuladas, y otro solo con las paradas.

**Lo que necesitas (una vez):** Node.js (ya lo tienes) y ffmpeg. Si la herramienta avisa de que falta ffmpeg, abre PowerShell y ejecuta `winget install --id Gyan.FFmpeg -e`; después cierra y vuelve a abrir la herramienta.

**Cada semana:**
1. Registra el partido en la app (en diferido: pausa el cronómetro cuando pauses el vídeo) y, al finalizar, guarda la copia de seguridad en **iCloud Drive**.
2. Haz doble clic en **«Abrir herramienta de video.cmd»**. Se abre una página en el navegador; deja abierta la ventana negra mientras la usas.
3. **Vídeo:** propone el vídeo de partido más reciente de Descargas. **Partido:** propone la copia más reciente de Descargas o iCloud Drive (si iCloud no sincroniza en el PC, bájala a Descargas desde icloud.com o mandándotela por WhatsApp/correo, o elígela con «📂 Elegir otra copia…»); elige partido y portero.
4. **Pitidos:** lleva el vídeo al pitido inicial de cada parte y pulsa «Pitido 1.ª/2.ª parte = aquí». Se recuerdan para ese vídeo.
5. **Calcular clips:** revisa la lista; puedes quitar un clip, verlo o moverlo 2 segundos.
6. **Generar:** escribe la jornada y pulsa Generar. Se guardan en la carpeta del portero dentro de `VÍDEO ANÁLISIS 26-27`:
   - `Vídeo Análisis <Portero> vs <Rival> J<n>.mp4`
   - `PARADAS <Portero> vs <Rival> J<n>.mp4` (en `PARADAS <PORTERO>` si existe)

**Cómo corta:** la app apunta el minuto cuando eliges la acción. En la J11 ese minuto quedó unos segundos ANTES del remate (se pulsa al ver venir la jugada), así que cada clip deja más margen después: tiros y centros 8 s antes y 12 después; salidas, espalda y aéreos 8/10; distribución 4/8; ABP defensiva 12/15; marcas 10/8. Las acciones seguidas se unen en un solo clip. Puedes cambiar los márgenes copiando `video/config.ejemplo.json` como `video/config.json`.

El vídeo original no se modifica y nada sale de tu PC.

## Notas sobre las métricas

- **% paradas** = paradas / tiros a puerta. A puerta = gol, blocaje, rechace o córner. «Fuera / poste» no cuenta como tiro a puerta.
- **Éxito en distribución** = completado o 2.ª jugada ganada. La **línea de destino** se calcula por tercios del campo: tercio propio = 1.ª línea, tercio medio = 2.ª, tercio rival = 3.ª.
- **Centros**: «intervención» es el % de centros en los que sale el portero; «éxito» se calcula solo sobre los centros en los que sale; «decisión correcta» usa tu valoración.
- Todos los porcentajes muestran el número de acciones, por ejemplo **67 % (4/6)**. Con muestras pequeñas, interprétalos con cautela.
- No se calcula xG ni goles evitados por modelo: requeriría un modelo entrenado. El campo «¿Gol evitable?» recoge tu criterio experto.

## Desarrollo

- Pruebas de lógica: `npm test`
- Pruebas en navegador (Playwright, tamaño iPad): `node e2e/setup.mjs`, `register-live.mjs`, `report.mjs`, `season.mjs` y `offline.mjs`
- Iconos: `node scripts/make-icons.mjs`
- Herramienta de vídeo: `npm run video`; prueba completa con vídeo sintético (ffmpeg + Playwright): `npm run e2e:video`

## 7. Wellness de Tally → Excel de monitorización

Lee las respuestas del formulario de wellness por la API de Tally y las escribe en la tabla `tblWellness` (hoja WELLNESS) a través del propio Excel, como si las teclearas: no toca fórmulas, formatos ni gráficos, y puedes seguir escribiendo filas a mano.

**Primera vez** (PowerShell, en la carpeta de la app; el Excel cerrado):

```
git pull
node wellness\sincronizar.mjs --simular
```

Te pide la clave de la API (Tally → Settings → API keys) y la guarda solo en este PC (`%APPDATA%\porteros\tally.json`). `--simular` enseña qué filas añadiría sin guardar nada. Si está bien, repite sin `--simular`. Una sola vez: `node wellness\sincronizar.mjs --reparar-dashboard` (reintroduce las fórmulas TAKE del DASHBOARD, que el archivo traía mal grabadas).

**Día a día:** doble clic en **«Actualizar wellness.cmd»** con el Excel cerrado.

**Reglas:**
- Un wellness por portero y día: si alguien envía dos veces, vale el último (si no, el readiness sumaría los dos).
- Si el día ya tiene datos en el Excel, no se toca; si es un día preparado vacío, se rellena; si no existe, va a la primera fila libre.
- Dolor: si la pregunta de Tally es de 1 a 10, se pasa a 1-5 (1-2→1, 3-4→2, 5-6→3, 7-8→4, 9-10→5) y queda anotado en Observaciones. Cuando la pregunta sea de 1 a 5, no se convierte.
- Molestias (zonas marcadas y texto) van a Observaciones. Valores fuera de escala: celda vacía y aviso.
- Apodos («Jona», «Uri») → nombre del Excel. Un nombre desconocido entra igual y sale un aviso.
- Sin API: `node wellness\sincronizar.mjs --csv RUTA_DEL_CSV` con el CSV descargado de Tally.

Opcional: `wellness/config.json` con `{ "libro": "...", "porteros": ["..."], "alias": { "apodo": "Nombre" }, "formId": "..." }`. Cada sincronización queda apuntada en `wellness/registro.txt`.
