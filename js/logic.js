// Funciones puras: tiempos, líneas, estadísticas y CSV. Sin DOM.

export const destLine = y => (y < 1 / 3 ? 1 : y < 2 / 3 ? 2 : 3);

export function minuteLabel(half, t) {
  const base = half === 2 ? 45 : 0, m = Math.floor(t / 60) + 1;
  return m > 45 ? `${base + 45}+${m - 45}'` : `${base + m}'`; // añadido: 45+1', 90+2'
}

// "12", "45+2", "67", "90+3'" -> {half, t}; null si no es un minuto válido.
export function parseMinute(str) {
  const m = String(str).trim().replace(/[’′']$/, '').match(/^(\d{1,3})(?:\+(\d{1,2}))?$/);
  if (!m) return null;
  const n = +m[1], extra = m[2] == null ? null : +m[2];
  if (extra != null) return (n === 45 || n === 90) && extra >= 1 ? { half: n === 45 ? 1 : 2, t: (44 + extra) * 60 } : null;
  if (n >= 1 && n <= 45) return { half: 1, t: (n - 1) * 60 };
  if (n >= 46 && n <= 90) return { half: 2, t: (n - 46) * 60 };
  return null;
}

export const clockSeconds = (c, nowMs) =>
  c.accumulated + (c.running && c.startedAt ? (nowMs - c.startedAt) / 1000 : 0);

export const pct = (n, d) => ({ n, d, value: d ? n / d : null });
export const fmtPct = p => (p.d ? `${Math.round(p.value * 100)} % (${p.n}/${p.d})` : `— (0/0)`);
export const per90 = (v, minutes) => (minutes ? (v * 90) / minutes : null);

const count = (arr, f) => arr.filter(f).length;
const ON_TARGET = ['gol', 'blocaje', 'rechace_seguro', 'rechace_peligroso', 'corner'];
export const DIST_TYPES = ['pase', 'mano', 'volea', 'saque_puerta'];
const distOk = a => ['completado', 'segunda_ganada'].includes(a.attrs.resultado);

function aerialStats(list) {
  const out = list.filter(a => a.attrs.decision === 'sale');
  const rated = list.filter(a => a.attrs.valoracion);
  return {
    n: list.length,
    intervention: pct(out.length, list.length),
    success: pct(count(out, a => a.attrs.resultado === 'exito'), out.length),
    correctDecision: pct(count(rated, a => a.attrs.valoracion === 'correcta'), rated.length),
  };
}

function groupPct(list, keyOf, keys) {
  return Object.fromEntries(keys.map(k => {
    const g = list.filter(a => keyOf(a) === k);
    return [k, pct(count(g, distOk), g.length)];
  }));
}

export function matchStats(actions) {
  const of = type => actions.filter(a => a.type === type);
  const shots = of('tiro');
  const onTarget = shots.filter(a => ON_TARGET.includes(a.attrs.resultado));
  const shotGoals = shots.filter(a => a.attrs.resultado === 'gol');
  const pens = of('penalti');
  const penGoals = pens.filter(a => a.attrs.resultado === 'gol');
  const goalsAll = [...shotGoals, ...penGoals];
  const ones = of('salida');
  const onesRated = ones.filter(a => a.attrs.valoracion);
  const dist = actions.filter(a => DIST_TYPES.includes(a.type));
  const penSided = pens.filter(a => a.attrs.lado_portero && a.points.lanzamiento != null);
  const SIDE = { izq: 0, centro: 1, der: 2 };
  const saves = onTarget.length - shotGoals.length;
  return {
    shots: shots.length,
    onTarget: onTarget.length,
    saves,
    savePct: pct(saves, onTarget.length),
    goals: goalsAll.length,
    goalsAvoidable: count(goalsAll, a => a.attrs.evitable === 'si'),
    goalsDebatable: count(goalsAll, a => a.attrs.evitable === 'discutible'),
    goalsNotAvoidable: count(goalsAll, a => a.attrs.evitable === 'no'),
    crosses: aerialStats(of('centro')),
    aerial: aerialStats(of('aereo')),
    oneVone: {
      n: ones.length,
      success: pct(count(ones, a => a.attrs.resultado === 'exito'), ones.length),
      correctDecision: pct(count(onesRated, a => a.attrs.valoracion === 'correcta'), onesRated.length),
    },
    dist: {
      n: dist.length,
      total: pct(count(dist, distOk), dist.length),
      byLine: groupPct(dist, a => (a.points.destino ? destLine(a.points.destino.y) : null), [1, 2, 3]),
      byHeight: groupPct(dist, a => a.attrs.altura, ['raso', 'media', 'alto']),
      byPressure: groupPct(dist, a => a.attrs.presion, ['sin', 'media', 'alta']),
      byType: groupPct(dist, a => a.type, DIST_TYPES),
    },
    penalties: {
      ...pct(count(pens, a => a.attrs.resultado === 'parada'), pens.length),
      goals: penGoals.length,
      guessed: pct(count(penSided, a => a.points.lanzamiento % 3 === SIDE[a.attrs.lado_portero]), penSided.length),
    },
    abpDef: of('abp_def').length,
    perHalf: { 1: count(actions, a => a.half === 1), 2: count(actions, a => a.half === 2) },
  };
}

export function seasonStats(matches, actions, keeperId) {
  const perMatch = matches
    .map(m => ({ match: m, minutes: m.keepers.find(k => k.keeperId === keeperId)?.minutes }))
    .filter(r => r.minutes != null)
    .sort((a, b) => a.match.date.localeCompare(b.match.date))
    .map(r => ({ ...r, stats: matchStats(actions.filter(a => a.matchId === r.match.id && a.keeperId === keeperId)) }));
  const ids = new Set(perMatch.map(r => r.match.id));
  return {
    totals: matchStats(actions.filter(a => ids.has(a.matchId) && a.keeperId === keeperId)),
    minutes: perMatch.reduce((s, r) => s + r.minutes, 0),
    perMatch,
  };
}

const cell = v => {
  const s = v == null ? '' : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCSV = (rows, columns) =>
  '﻿' + [columns, ...rows.map(r => columns.map(c => r[c]))].map(r => r.map(cell).join(';')).join('\n') + '\n';
