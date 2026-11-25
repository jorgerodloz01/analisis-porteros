// Catálogo de acciones: pasos, opciones y campos obligatorios.
// kind 'pitch' y 'goal' guardan en action.points; 'choice' y 'receptor' en action.attrs.

const o = (...pairs) => pairs.map(([value, label]) => ({ value, label }));
const pitch = (key, label, required = false) => ({ key, label, kind: 'pitch', required });
const goal = (key, label, required = false) => ({ key, label, kind: 'goal', required });
const choice = (key, label, options, required = false, showIf) => ({ key, label, kind: 'choice', options, required, showIf });

const VALORACION = choice('valoracion', 'Valoración decisión', o(['correcta', 'Correcta'], ['debia_salir', 'Debía salir'], ['no_debia_salir', 'No debía salir']));

const aerial = label => ({
  label,
  steps: [
    pitch('origen', 'Origen del centro', true),
    pitch('caida', 'Punto de caída'),
    choice('trayectoria', 'Trayectoria', o(['bombeada', 'Bombeada'], ['tensa', 'Tensa'], ['rasa', 'Rasa'], ['segundo_palo', '2.º palo'])),
    choice('decision', 'Decisión', o(['sale', 'Sale'], ['se_queda', 'Se queda']), true),
    choice('accion', 'Acción', o(['blocaje', 'Blocaje'], ['despeje_1', 'Despeje 1 puño'], ['despeje_2', 'Despeje 2 puños'], ['desvio', 'Desvío'], ['no_llega', 'No llega']), false, a => a.attrs.decision === 'sale'),
    choice('resultado', 'Resultado', o(['exito', 'Éxito'], ['fallo', 'Fallo']), true),
    VALORACION,
  ],
});

const dist = (label, withLeg = true) => ({
  label,
  steps: [
    pitch('origen', 'Origen', true),
    pitch('destino', 'Destino', true),
    choice('altura', 'Altura', o(['raso', 'Raso'], ['media', 'Media'], ['alto', 'Alto'])),
    ...(withLeg ? [choice('pierna', 'Pierna', o(['d', 'Derecha'], ['i', 'Izquierda']))] : []),
    choice('presion', 'Presión rival', o(['sin', 'Sin presión'], ['media', 'Media'], ['alta', 'Alta'])),
    { key: 'receptor', label: 'Receptor', kind: 'receptor', required: false },
    choice('resultado', 'Resultado', o(['completado', 'Completado'], ['perdido', 'Perdido'], ['segunda_ganada', '2.ª jugada ganada'], ['segunda_perdida', '2.ª jugada perdida']), true),
  ],
});

export const TYPES = {
  tiro: {
    label: 'Tiro / parada',
    steps: [
      pitch('origen', 'Origen del tiro', true),
      pitch('posicion_portero', 'Posición del portero'),
      goal('porteria', 'Zona de portería', true),
      choice('superficie', 'Superficie', o(['pie_d', 'Pie dcho.'], ['pie_i', 'Pie izdo.'], ['cabeza', 'Cabeza'], ['otra', 'Otra'])),
      choice('contexto', 'Contexto', o(['posicional', 'Ataque posicional'], ['contraataque', 'Contraataque'], ['abp', 'ABP'], ['uno_vs_uno', '1 vs 1'])),
      choice('desviado', 'Desviado / tapado', o(['si', 'Sí'], ['no', 'No'])),
      choice('tecnica', 'Técnica', o(['blocaje', 'Blocaje'], ['desvio', 'Desvío'], ['estirada', 'Estirada'], ['pies', 'Con pies'], ['mano_cambiada', 'Mano cambiada'], ['otra', 'Otra'])),
      choice('resultado', 'Resultado', o(['gol', 'Gol'], ['blocaje', 'Blocaje'], ['rechace_seguro', 'Rechace a zona segura'], ['rechace_peligroso', 'Rechace peligroso'], ['corner', 'Córner'], ['fuera_poste', 'Fuera / poste']), true),
      choice('evitable', '¿Gol evitable?', o(['si', 'Sí'], ['no', 'No'], ['discutible', 'Discutible']), false, a => a.attrs.resultado === 'gol'),
    ],
  },
  centro: aerial('Centro lateral'),
  aereo: { ...aerial('Juego aéreo'), steps: aerial('').steps.map(s => (s.key === 'origen' ? { ...s, label: 'Origen del balón' } : s)) },
  salida: {
    label: 'Salida / 1v1',
    steps: [
      pitch('punto', 'Punto de intervención', true),
      choice('accion', 'Acción', o(['pie', 'Despeje con pie'], ['cabeza', 'Cabeza'], ['entrada', 'Entrada'], ['bloqueo', 'Bloqueo'], ['temporizacion', 'Temporización'])),
      choice('resultado', 'Resultado', o(['exito', 'Éxito'], ['fallo', 'Fallo']), true),
      VALORACION,
    ],
  },
  espalda: {
    label: 'Balón a la espalda',
    steps: [
      pitch('punto', 'Punto de caída', true),
      choice('decision', 'Decisión', o(['sale', 'Sale'], ['se_queda', 'Se queda']), true),
      choice('accion', 'Acción', o(['pie', 'Despeje con pie'], ['cabeza', 'Cabeza'], ['controla', 'Controla y juega'], ['blocaje', 'Blocaje'], ['entrada', 'Entrada'], ['no_llega', 'No llega']), false, a => a.attrs.decision === 'sale'),
      choice('resultado', 'Resultado', o(['exito', 'Éxito'], ['fallo', 'Fallo']), true),
      VALORACION,
    ],
  },
  pase: dist('Pase en juego'),
  mano: dist('Saque con mano', false),
  volea: dist('Volea / media volea'),
  saque_puerta: dist('Saque de puerta'),
  abp_def: {
    label: 'ABP defensiva',
    steps: [
      choice('subtipo', 'Tipo', o(['corner', 'Córner'], ['falta_lateral', 'Falta lateral'], ['falta_frontal', 'Falta frontal']), true),
      pitch('posicion_portero', 'Posición inicial del portero'),
      choice('barrera', 'Jugadores en barrera', o(...[0, 1, 2, 3, 4, 5, 6].map(n => [String(n), String(n)])), false, a => !!a.attrs.subtipo && a.attrs.subtipo !== 'corner'),
      choice('intervencion', 'Intervención', o(['ninguna', 'Ninguna'], ['tiro', 'Tiro → registrar'], ['centro', 'Centro → registrar']), true),
    ],
  },
  penalti: {
    label: 'Penalti',
    steps: [
      goal('lanzamiento', 'Zona del lanzamiento', true),
      choice('lado_portero', 'Lado al que se tira el portero (visto desde el campo)', o(['izq', 'Izquierda'], ['centro', 'Centro'], ['der', 'Derecha'])),
      choice('resultado', 'Resultado', o(['gol', 'Gol'], ['parada', 'Parada'], ['fuera_poste', 'Fuera / poste']), true),
    ],
  },
  abp_of: {
    label: 'ABP ofensiva',
    steps: [
      choice('participacion', 'Participación', o(['saque', 'Saque'], ['otra', 'Otra']), true),
      choice('resultado', 'Resultado', o(['exito', 'Éxito'], ['fallo', 'Fallo'])),
    ],
  },
  // Marca de vídeo: un toque desde la cabecera del registro. No cuenta en estadísticas ni está en ninguna pestaña.
  marca: {
    label: 'Marca de vídeo',
    steps: [choice('etiqueta', 'Qué es', o(['colocacion_centro', 'Colocación en centro'], ['finalizacion', 'Finalización sin tiro'], ['otra', 'Otra']))],
  },
};

export const TABS = [
  { key: 'defensa', label: 'Defensa', sub: 'Tiros · centros · espalda · salidas', types: ['tiro', 'centro', 'aereo', 'espalda', 'salida'] },
  { key: 'distribucion', label: 'Distribución', sub: 'Pases · saques', types: ['pase', 'mano', 'volea', 'saque_puerta'] },
  { key: 'abp', label: 'ABP', sub: 'Defensiva · penaltis · ofensiva', types: ['abp_def', 'penalti', 'abp_of'] },
];

export const visibleSteps = (type, action) => TYPES[type].steps.filter(s => !s.showIf || s.showIf(action));

export const stepValue = (s, a) => (s.kind === 'pitch' || s.kind === 'goal' ? a.points[s.key] : a.attrs[s.key]);

export const missingRequired = (type, action) =>
  visibleSteps(type, action).filter(s => s.required && stepValue(s, action) == null).map(s => s.key);

// Todas las claves de atributos (para columnas CSV).
export const ATTR_KEYS = [...new Set(Object.values(TYPES).flatMap(t => t.steps.filter(s => s.kind === 'choice' || s.kind === 'receptor').map(s => s.key)))];

// Quita lo registrado en pasos que una respuesta posterior ha ocultado (p. ej. «evitable» si ya no es gol).
export function cleanAction(action) {
  const visible = new Set(visibleSteps(action.type, action).map(s => s.key));
  const points = { ...action.points }, attrs = { ...action.attrs };
  for (const s of TYPES[action.type].steps) if (!visible.has(s.key)) { delete points[s.key]; delete attrs[s.key]; }
  return { ...action, points, attrs };
}
