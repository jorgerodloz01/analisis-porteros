# Vídeo automático de las acciones del portero — Diseño

Fecha: 2026-11-25 · Diseño de Claude a partir de la conversación con Jorge (aprobado en el chat).

## 1. Intención

Cada semana Jorge monta con Clipchamp el vídeo del partido anterior para el portero titular: todas sus acciones con balón y las situaciones en las que influye. Localizar, cortar y unir le cuesta **~1 h 30 por semana**. Desde la jornada 12 registrará todos los partidos en la app (casi siempre en diferido, alguno en directo), así que la app ya sabe **cuándo** pasa cada acción. Falta convertir eso en el vídeo.

Éxito: con el partido registrado, el vídeo sale en unos minutos de trabajo suyo (marcar dos pitidos y revisar la lista), sin Clipchamp.

## 2. Objetivos, no-objetivos, anti-objetivos

**Objetivos**
- Vídeo con todas las acciones registradas del portero elegido, rotuladas (minuto · acción · resultado), y un segundo vídeo solo con las paradas.
- Cubrir también lo que hoy no se registra y quiere ver: **colocación en centros, pases a la espalda, tiros fuera** (ya existen) **y situaciones de finalización**.
- Trabajar con el archivo que Jorge ya tiene descargado en el PC (descarga de Esports+, imagen que sigue el juego, varios GB).
- Gratis, sin internet, sin instalar nada más que ffmpeg.

**No-objetivos (esta versión)**
- Detección automática por visión artificial (fase posterior; los partidos registrados servirán para medirla).
- Dibujar sobre el vídeo (flechas, zonas).
- Procesar vídeo en el iPad.

**Anti-objetivos**
- Clips que empiecen tarde y se coman la jugada.
- Que la herramienta toque o mueva el vídeo original.
- Rótulos que aparenten un dato que no se registró.

## 3. Cambios en la app (iPad)

1. **Nuevo tipo «Balón a la espalda»** (pestaña Defensa), con la misma estructura que los centros: punto de caída★, decisión★ (sale / se queda), acción si sale (despeje con pie, cabeza, controla y juega, blocaje, entrada, no llega), resultado★ (éxito / fallo), valoración de la decisión. Estadísticas: n, % intervención, % éxito de las salidas, % decisión correcta (mismo cálculo que centros). Aparece en el informe y en la temporada.
2. **Botón «🎬 Marcar»** en la cabecera del registro. Un toque guarda una «marca de vídeo» en el instante del cronómetro, sin interrumpir una acción a medias. Aparece un aviso con etiquetas opcionales (Colocación en centro · Finalización sin tiro · Otra); tocar una la asigna. Las marcas **no cuentan en ninguna estadística**; salen en la lista de acciones del informe y en el CSV.
3. Versión de la app 1.3.0 (el iPad la descarga sola).

## 4. Herramienta de vídeo (PC con Windows)

Una página local que se abre con doble clic en «Abrir herramienta de vídeo» (Node.js ya instalado + ffmpeg). Nada sale del PC.

**Flujo**
1. **Vídeo:** propone el vídeo de partido más reciente de Descargas (prioriza archivos grandes, de más de 1 GB); se puede elegir otro de la lista.
2. **Copia de la app:** propone la copia `porteros-backup-*.json` más reciente de iCloud Drive o Descargas; se puede elegir otro archivo. Se elige partido y portero.
3. **Sincronizar:** con el reproductor, se marca el pitido inicial de la 1.ª y de la 2.ª parte (también se pueden escribir). Se recuerdan por vídeo.
4. **Revisar clips:** lista con minuto, acción, inicio y fin; casilla para quitar, «▶ ver» y ajuste de ±2 s.
5. **Generar:** dos MP4 en la carpeta del portero dentro de `VÍDEO ANÁLISIS 26-27` (si no existe, en Descargas):
   - `Vídeo Análisis <Portero> vs <Rival> J<n>.mp4`: portada + clips con fundido corto y rótulo.
   - `PARADAS <Portero> vs <Rival> J<n>.mp4`: solo tiros parados y penaltis parados (en la carpeta `PARADAS <PORTERO>` si existe).

**Cálculo de cada clip**
- Instante en el vídeo = pitido inicial de su parte + segundos del cronómetro de la acción.
- La app guarda el minuto **al elegir la acción**, es decir, después de la jugada. Por eso el clip empieza antes. Ventanas por defecto (segundos antes / después): tiro 10/4 · penalti 8/4 · centro 12/4 · juego aéreo 10/4 · espalda 10/4 · salida 10/4 · distribución 4/6 · ABP defensiva 15/5 · ABP ofensiva 8/6 · marca 12/4. Editables en `config.json`.
- Clips que se solapan o quedan a ≤ 1 s se unen; el rótulo cambia en cada acción.
- Orden cronológico por defecto; opción «por bloques» (Defensa, Distribución, ABP, Marcas).

**Salida técnica:** 1920×1080, 30 fps, H.264 + AAC; el vídeo original no se modifica. Clips con fundido de 0,25 s, rótulo abajo a la izquierda en Arial negrita sobre caja oscura.

## 5. Enfoques considerados

| Enfoque | A favor | En contra | Decisión |
|---|---|---|---|
| **A. Desde los registros de la app** (este diseño) | Fiable, rápido de construir, sin tiempo extra si ya registra | Solo sale lo registrado o marcado | **Elegido** |
| B. Detección automática por visión | Sin registrar | Fiabilidad desconocida, librerías pesadas, horas de proceso | Fase posterior, medida contra A |
| C. Eventos de Veo / Player Spotlight | Ya existen | Parciales; Spotlight de pago, experimental en porteros y sin compilación | Descartado |

## 6. Restricciones y riesgos

- Precisión: depende de que el cronómetro de la app vaya con el vídeo (en diferido, pausarlo con el vídeo). Los márgenes absorben unos segundos; el paso 4 corrige el resto.
- ffmpeg en el PC: si falta, la página lo dice y da el comando `winget install --id Gyan.FFmpeg -e`.
- Archivos de varios GB: se leen por rangos; nunca se copian.
- Seguridad: el servidor solo escucha en 127.0.0.1 y solo sirve archivos de las carpetas permitidas.

## 7. Decisiones del constructor (delegadas)

Servidor Node sin dependencias; lógica de clips pura y probada con `node --test`; reutiliza `js/catalog.js` y `js/logic.js` para las etiquetas; prueba de extremo a extremo con un vídeo sintético con reloj impreso; textos de la interfaz en español.
