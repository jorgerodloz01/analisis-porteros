// Cálculo de clips a partir de las acciones registradas en la app. Funciones puras, sin ffmpeg ni disco.
import { TYPES, TABS } from '../js/catalog.js';
import { minuteLabel } from '../js/logic.js';

// Segundos [antes, después] del instante registrado. La app guarda el minuto al ELEGIR la acción.
// En la J11 (22/11/2026) el minuto quedó 4-10 s ANTES del remate en 3 de las 4 paradas (se pulsa al ver
// venir la jugada), así que la ventana deja más margen después que antes.
export const VENTANAS = {
  tiro: [8, 12], penalti: [8, 10], centro: [8, 12], aereo: [8, 10], espalda: [8, 10], salida: [8, 10],
  pase: [4, 8], mano: [4, 8], volea: [4, 8], saque_puerta: [4, 8],
  abp_def: [12, 15], abp_of: [8, 10], marca: [10, 8],
};
const POR_DEFECTO = [8, 10];
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
