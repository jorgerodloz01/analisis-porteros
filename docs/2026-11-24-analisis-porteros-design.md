# App de análisis de porteros — Diseño

Fecha: 2026-11-24 · Autor del diseño: Claude, a partir de la conversación con Jorge.

> **Cambio (2026-11-24):** Jorge decide **no cargar el vídeo en la app** para simplificar. En diferido el vídeo se ve en otro dispositivo y se registra con el cronómetro (pausable y ajustable). Se eliminan: reproductor, sincronización con pitido inicial y enlaces acción→vídeo. Lo que sigue en este documento sobre vídeo queda sin efecto.

## 1. Intención

Jorge (entrenador de porteros) necesita registrar desde su iPad, mientras ve un partido **en directo o en vídeo**, todas las acciones de sus porteros tocando sobre un campo dibujado, y obtener:

- un **informe por partido** (estadísticas, mapas, acciones enlazadas al vídeo), y
- un **acumulado de temporada por portero** (evolución partido a partido y comparación entre porteros).

El objetivo es dar feedback objetivo a los porteros y apoyar decisiones de entrenamiento, sin depender de software de pago.

## 2. Objetivos, no-objetivos y anti-objetivos

**Objetivos**
- Registro rápido: una acción típica en ≤ 6 toques; todos los pasos de detalle son opcionales (se puede guardar en cualquier paso).
- Funciona sin conexión en el estadio.
- Registro con cronómetro pausable y ajustable, válido en directo y en diferido.
- Portero seleccionable con nombre y foto.
- Informe exportable a PDF y datos a CSV/Excel.
- Gratuito: sin App Store, sin servidor, sin suscripciones.

**No-objetivos (fuera de esta versión)**
- xG / PSxG / "goles evitados" por modelo (no fiable sin modelo entrenado; se sustituye por la valoración experta "¿evitable?").
- Sincronización en la nube o varios usuarios/dispositivos.
- Cargar o reproducir vídeo en la app, enlazar acciones al vídeo, exportar clips.
- Tracking automático o detección de eventos.

**Anti-objetivos (sería un fracaso aunque "funcione")**
- Perder datos de un partido (cierre de Safari, batería, recarga).
- Que registrar sea tan lento que se pierda la siguiente jugada.
- Estadísticas que aparenten más precisión de la que tienen los datos.

## 3. Restricciones

- Dispositivo principal: iPad con Safari (añadida a la pantalla de inicio). Orientación horizontal.
- Alojamiento estático gratuito (GitHub Pages; código público, datos nunca salen del iPad).
- Safari no puede persistir vídeos de varios GB de forma fiable → el vídeo **no se guarda**: al reabrir un partido se vuelve a seleccionar el archivo (1 toque). La app comprueba nombre y tamaño para avisar si se elige un archivo distinto.
- Los datos viven solo en el iPad → la **copia de seguridad** (exportar/importar archivo) es obligatoria, con recordatorio al finalizar cada partido.

## 4. Enfoques considerados

| Enfoque | Pros | Contras | Decisión |
|---|---|---|---|
| **1. Web app instalable (PWA)**, vídeo reproducido desde Archivos sin copiar | Gratis, sin conexión, iteración rápida, vídeo de cualquier tamaño | Re-seleccionar el vídeo al reabrir | **Elegido por Jorge** |
| 2. App nativa iOS | Guarda vídeos, podría exportar clips | Mac + Xcode + 99 €/año; no se puede probar desde aquí | Descartado (coste) |
| 3. PWA que copia el vídeo a su almacenamiento | No re-seleccionar | iOS limita/borra ese espacio con GB de vídeo: riesgo de pérdida | Descartado |

## 5. Funcionamiento

### 5.1 Entidades

- **Temporada** (p. ej. "2026-27"). Una activa por defecto.
- **Portero**: nombre, dorsal, foto (recortada a 256 px), activo/inactivo.
- **Plantilla de jugadores de campo** (opcional): dorsal + nombre, para elegir el receptor de los pases.
- **Partido**: temporada, fecha, rival, local/visitante, competición, resultado, portero(s) que juegan con **minutos jugados** (entrada/salida para cambios), once opcional, archivo de vídeo vinculado (nombre/tamaño), **marcas de sincronización** (instante del vídeo del pitido inicial de 1.ª y 2.ª parte).
- **Acción**: partido, portero, parte, minuto (tiempo de partido), tipo, toques (coordenadas normalizadas 0–1 sobre campo y/o portería), atributos según tipo, nota.

Tiempo en vídeo de una acción = marca de inicio de su parte + tiempo de partido dentro de esa parte. Así, las acciones registradas en directo se enlazan al vídeo en cuanto se marcan los dos pitidos iniciales, y las registradas sobre el vídeo guardan ese mismo tiempo de partido.

### 5.2 Modos de registro

- **Directo**: cronómetro con Iniciar/Pausa, 1.ª/2.ª parte, ajuste manual ±.
- **Vídeo**: reproductor con ±2 s, ±5 s, velocidad 0,5×/1×/2×; al empezar a registrar una acción el vídeo se pausa y retrocede automáticamente al instante en que empezó la jugada (ajustable); al guardar continúa.
- Cambio de un modo a otro dentro del mismo partido.

### 5.3 Pantalla de registro (basada en la captura de Jorge)

Cabecera: equipo, marcador, cronómetro/tiempo de vídeo, botón "Gol a favor", "Finalizar partido", "Estadísticas".
Pestañas: **Defensa · Distribución · ABP**.
Izquierda: botones de tipo de acción. Centro: campo (portería propia abajo) y, cuando toca, portería en rejilla 3×3. Derecha: portero seleccionado (foto + nombre, cambio rápido) y lista de acciones registradas (editar/borrar/deshacer). Abajo: pasos numerados de la acción en curso + "Guardar".

### 5.4 Catálogo de acciones

Atributos marcados con ★ son los mínimos; el resto, opcionales.

**DEFENSA**
- **Tiro / parada**: toques: origen del tiro★, posición del portero, punto de portería (3×3)★. Superficie (pie D / pie I / cabeza / otra); contexto (ataque posicional, contraataque, ABP, 1v1); desviado/tapado sí/no; técnica (blocaje, desvío, estirada, con pies, mano cambiada, otra); resultado★ (gol, blocaje, rechace a zona segura, rechace peligroso, córner, fuera/poste); si gol: ¿evitable? (sí / no / discutible).
- **Centro lateral**: origen★, punto de caída. Trayectoria (bombeada, tensa, rasa, al 2.º palo); decisión★ (sale / se queda); acción (blocaje, despeje 1 puño, despeje 2 puños, desvío, no llega); resultado★ (éxito / fallo); valoración de la decisión (correcta / debía salir / no debía salir).
- **Juego aéreo** (balón frontal, no centro): igual que centro lateral.
- **Salida al espacio / 1v1**: punto de intervención★. Acción (despeje con pie, cabeza, entrada, bloqueo, temporización); resultado★; valoración de la decisión.

**DISTRIBUCIÓN**
- Tipos: **pase en juego (pie)**, **saque con mano**, **volea / media volea**, **saque de puerta**.
- Toques: origen★, destino★. **Línea de destino** calculada del destino: tercio defensivo = 1.ª línea, tercio medio = 2.ª, tercio ofensivo = 3.ª. Altura (raso / media / alto); pierna (D / I); presión rival (sin / media / alta); receptor (dorsal); resultado★ (completado, perdido, 2.ª jugada ganada, 2.ª jugada perdida).

**ABP**
- **Defensiva** (córner, falta lateral, falta frontal): posición inicial del portero (toque); nº en barrera (faltas); intervención → enlaza con flujo de tiro o centro.
- **Penalti**: lado del lanzamiento (3×3)★, lado al que se tira el portero, ¿adivina? (calculado), resultado★.
- **Ofensiva**: solo si interviene el portero (saque / participación), resultado.

### 5.5 Informe por partido

- Resumen: tiros recibidos, a puerta, paradas, % paradas, goles encajados (evitables / no evitables / discutibles), acciones por parte.
- Mapas: origen de tiros (colores por resultado) y portería 3×3 (tiros y goles).
- Centros y juego aéreo: nº, % intervención, % éxito, % decisiones correctas.
- 1v1 / salidas: nº, % éxito.
- Distribución: % acierto total, por línea, por altura, por presión, por tipo; mapa de destinos.
- Penaltis y ABP.
- Lista de acciones con enlace al vídeo (tocar → salta al instante).
- Exportar **PDF** (impresión de Safari → "Guardar en Archivos") y **CSV** (una fila por acción, abre en Excel).

### 5.6 Acumulado de temporada

- Por portero: mismas métricas agregadas, totales y **por 90 minutos** (con minutos jugados), tabla de evolución partido a partido y gráfico de líneas de las métricas clave (% paradas, % acierto distribución, % decisiones correctas en centros).
- Comparación entre porteros: tabla lado a lado.
- Filtros: temporada, competición, local/visitante.
- Muestras pequeñas: los porcentajes muestran siempre el n (p. ej. "67 % (4/6)") para no sobreinterpretar.
- Exportar PDF y CSV.

### 5.7 Datos y seguridad

- Guardado inmediato de cada acción en el almacenamiento interno del navegador (IndexedDB); se solicita almacenamiento persistente.
- Exportar/importar copia completa (incluye fotos) en un archivo; recordatorio al finalizar partido y aviso si no hay copia en 7 días.
- Funciona sin conexión tras la primera carga.

## 6. Decisiones técnicas (del constructor; Jorge las delegó)

- HTML + CSS + JavaScript sin frameworks ni paso de compilación; gráficos y campos dibujados en SVG; sin dependencias externas en tiempo de ejecución.
- Pruebas automáticas de la lógica (cálculo de línea de destino, sincronización vídeo, agregados) y prueba en navegador con Playwright (viewport iPad).
- Repositorio en GitHub de Jorge + GitHub Pages; instrucciones paso a paso para publicarlo e instalarlo en el iPad.

## 7. Lo que queda al constructor

Estilo visual concreto (tema oscuro tipo captura), textos de botones, orden exacto de pasos dentro de cada acción, retroceso automático por defecto del vídeo (propuesta: 3 s).
