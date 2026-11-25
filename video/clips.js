// Cálculo de clips a partir de las acciones registradas en la app. Funciones puras, sin ffmpeg ni disco.
import { TYPES, TABS } from '../js/catalog.js';
import { minuteLabel } from '../js/logic.js';

// Segundos [antes, después] del instante registrado. La app guarda el minuto al ELEGIR la acción,
// es decir, después de la jugada: por eso el margen de antes es mayor.
export const VENTANAS = {
  tiro: [10, 4], penalti: [8, 4], centro: [12, 4], aereo: [10, 4], espalda: [10, 4], salida: [10, 4],
  pase: [4, 6], mano: [4, 6], volea: [4, 6], saque_puerta: [4, 6],
  abp_def: [15, 5], abp_of: [8, 6], marca: [12, 4],
};
const POR_DEFECTO = [10, 4];
const UNION = 1; // clips separados por ≤ 1 s se unen

const RESULT_KEYS = ['resultado', 'intervencion', 'participacion', 'etiqueta'];

export function actionLabel(a) {
  const type = TYPES[a.type];
  const step = type?.steps.find(s => RESULT_KEYS.includes(s.key));
  const result = step?.options?.find(o => o.value === a.attrs?.[step.key])?.label;
  const name = a.type === 'marca' ? 'Marca' : type?.label ?? a.type;
  return [minuteLabel(a.half, a.t), name, result].filter(Boolean).join(' · ');
}

// actions: acciones de la app; kick1/kick2: segundo del vídeo del pitido inicial de cada parte (null si no se marcó).
export function buildClips(actions, { kick1, kick2, duration = Infinity, ventanas = VENTANAS }) {
  const descartadas = [];
  const raw = [];
  for (const a of actions) {
    const kick = a.half === 1 ? kick1 : kick2;
    const at = kick == null ? null : kick + a.t;
    if (at == null || at < 0 || at > duration) { descartadas.push(a); continue; }
    const [before, after] = ventanas[a.type] ?? POR_DEFECTO;
    raw.push({ start: Math.max(0, at - before), end: Math.min(duration, at + after), at, a });
  }
  raw.sort((x, y) => x.start - y.start || x.at - y.at);
  const merged = [];
  for (const r of raw) {
    const last = merged[merged.length - 1];
    if (last && r.start - last.end <= UNION) { last.end = Math.max(last.end, r.end); last.items.push(r); }
    else merged.push({ start: r.start, end: r.end, items: [r] });
  }
  const clips = merged.map(m => ({
    id: m.items[0].a.id,
    start: m.start,
    end: m.end,
    include: true,
    actions: m.items.map(r => ({ id: r.a.id, type: r.a.type, label: actionLabel(r.a), at: r.at - m.start, parada: isParada(r.a) })),
  }));
  return { clips, descartadas };
}

const block = type => {
  const i = TABS.findIndex(t => t.types.includes(type));
  return i === -1 ? TABS.length : i; // marcas al final
};

export function orderClips(clips, modo = 'crono') {
  const byTime = [...clips].sort((a, b) => a.start - b.start);
  if (modo !== 'bloques') return byTime;
  return byTime.sort((a, b) => block(a.actions[0].type) - block(b.actions[0].type)); // sort estable: dentro del bloque, por tiempo
}

const SAVED = ['blocaje', 'rechace_seguro', 'rechace_peligroso', 'corner'];
export const isParada = a =>
  (a.type === 'tiro' && SAVED.includes(a.attrs?.resultado)) || (a.type === 'penalti' && a.attrs?.resultado === 'parada');

const clean = s => String(s ?? '').replace(/[<>:"/\\|?*]/g, '-').trim();

export function outputNames({ portero, rival, jornada }) {
  const j = String(jornada ?? '').trim();
  const base = `${clean(portero)} vs ${clean(rival)}${j ? ` J${clean(j)}` : ''}.mp4`;
  return { acciones: `Vídeo Análisis ${base}`, paradas: `PARADAS ${base}` };
}
