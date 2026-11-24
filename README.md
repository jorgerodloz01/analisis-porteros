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
   - El minuto se toma al elegir la acción. Puedes corregirlo con el botón ⏱.
   - La portería y el lado del penalti se registran **vistos desde el campo**, como en la imagen de la TV.
   - Para editar una acción, tócala en el registro de la derecha. Para borrarla, pulsa ✕.
   - Al guardar un gol, el marcador en contra se actualiza solo. Los goles a favor se suman con +.
4. **Informe**: muestra las estadísticas, los mapas y la lista de acciones con su minuto. **PDF** abre la impresión de Safari, desde donde puedes «Guardar en Archivos» o compartirlo. **CSV** descarga los datos para Excel.
5. **Temporada**: muestra el acumulado por portero (totales, métricas por 90 minutos y evolución partido a partido) y la comparación entre porteros, con filtros por competición y condición.

## 4. Copias de seguridad (importante)

Los datos viven **solo en este iPad**, en el almacenamiento de Safari. Si borras los datos de Safari, desinstalas la app o pierdes el iPad, se pierden.

- Al **Finalizar** un partido, la app te propone exportar una copia. Se abre «Compartir»: elige **Guardar en Archivos** (mejor en iCloud Drive). La copia solo se da por hecha si la guardas.
- En **Configuración → Copia de seguridad** puedes exportar o importar cuando quieras. Al importar se **sustituyen** todos los datos actuales.
- Si pasan más de 7 días sin copia, aparece un aviso.

## 5. Actualizaciones

Cada vez que publiques cambios en el código, **sube el número `VERSION` de `sw.js`** (por ejemplo, de `1.1.0` a `1.1.1`). El iPad descarga la versión nueva completa en segundo plano y la usa **a partir de la siguiente vez** que abras la app. Si no cambias `VERSION`, el iPad seguirá usando la versión anterior.

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
