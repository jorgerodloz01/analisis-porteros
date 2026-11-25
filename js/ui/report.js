import * as db from '../db.js';
import { h } from './dom.js';
import { TYPES, ATTR_KEYS } from '../catalog.js';
import { matchStats, fmtPct, toCSV, minuteLabel, destLine, DIST_TYPES } from '../logic.js';
import { pitchSVG, goalSVG, drawMarkers } from './pitch.js';
import { avatar } from './setup.js';
import { download } from '../backup.js';

const C = { gol: '#ef4444', parada: '#22c55e', fuera: '#94a3b8', ok: '#22c55e', bad: '#ef4444' };
const SAVED = ['blocaje', 'rechace_seguro', 'rechace_peligroso', 'corner'];
const label = (type, key, value) => TYPES[type]?.steps.find(s => s.key === key)?.options?.find(o => o.value === value)?.label ?? value ?? '';
const kpi = (value, text) => h('div.kpi', h('b', value), h('span', text));
const table = (head, rows) => h('table.t', h('thead', h('tr', head.map(x => h('th', x)))), h('tbody', rows.map(r => h('tr', r.map(x => h('td', x))))));
const legend = items => h('div.legend', items.map(([c, t]) => h('span', h('i', { style: `background:${c}` }), t)));

// Bloque de estadísticas + mapas, reutilizado por el informe de temporada.
export function statsBlock(stats, actions) {
  const shots = actions.filter(a => a.type === 'tiro' && a.points.origen);
  const shotMap = drawMarkers(pitchSVG({ half: shots.every(a => a.points.origen.y <= .5) }), shots.map(a => ({
    p: a.points.origen, color: a.attrs.resultado === 'gol' ? C.gol : SAVED.includes(a.attrs.resultado) ? C.parada : C.fuera })));
  const counts = {};
  for (const a of actions) {
    const cell = a.type === 'tiro' ? a.points.porteria : a.type === 'penalti' ? a.points.lanzamiento : null;
    if (cell == null) continue;
    const c = (counts[cell] ??= { n: 0, g: 0 });
    c.n++; if (a.attrs.resultado === 'gol') c.g++;
  }
  const goalMap = goalSVG({ counts: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, `${v.n}${v.g ? ` · ${v.g} gol${v.g > 1 ? 'es' : ''}` : ''}`])) });
  const dist = actions.filter(a => DIST_TYPES.includes(a.type) && a.points.origen && a.points.destino);
  const distMap = drawMarkers(pitchSVG(), dist.map(a => ({
    p: a.points.origen, to: a.points.destino, r: .6,
    color: ['completado', 'segunda_ganada'].includes(a.attrs.resultado) ? C.ok : a.attrs.resultado ? C.bad : C.fuera })));
  const aerialRow = (name, s) => [name, String(s.n), s.intervention ? fmtPct(s.intervention) : '—', fmtPct(s.success), fmtPct(s.correctDecision)];
  const d = stats.dist;
  const distRows = [
    ['Total', fmtPct(d.total)],
    ...[1, 2, 3].map(k => [`Destino ${k}.ª línea`, fmtPct(d.byLine[k])]),
    ...['raso', 'media', 'alto'].map(k => [`Altura: ${label('pase', 'altura', k)}`, fmtPct(d.byHeight[k])]),
    ...['sin', 'media', 'alta'].map(k => [`Presión: ${label('pase', 'presion', k)}`, fmtPct(d.byPressure[k])]),
    ...DIST_TYPES.map(k => [TYPES[k].label, fmtPct(d.byType[k])]),
  ];
  return [
    h('section.card',
      h('h2', 'Portería'),
      h('div.kpis',
        kpi(stats.shots, 'Tiros recibidos'), kpi(stats.onTarget, 'A puerta'), kpi(fmtPct(stats.savePct), 'Paradas / a puerta'),
        kpi(stats.goals, `Goles encajados (incl. penaltis)`), kpi(stats.goalsAvoidable, 'Goles evitables'), kpi(stats.goalsNotAvoidable, 'Goles no evitables'), kpi(stats.goalsDebatable, 'Goles discutibles'))),
    h('section.card',
      h('h2', 'Mapas'),
      h('div.maps',
        h('figure', shotMap, h('figcaption', 'Origen de los tiros'), legend([[C.gol, 'Gol'], [C.parada, 'Parada'], [C.fuera, 'Fuera / poste']])),
        h('figure', goalMap, h('figcaption', 'Destino en portería (tiros y penaltis, vista desde el campo): nº de tiros · goles')),
        h('figure', distMap, h('figcaption', 'Distribución: origen → destino (líneas discontinuas = tercios)'), legend([[C.ok, 'Éxito'], [C.bad, 'Pérdida'], [C.fuera, 'Sin resultado']])))),
    h('section.card',
      h('h2', 'Juego aéreo y salidas'),
      table(['Acción', 'n', 'Intervención (sale)', 'Éxito (de las salidas)', 'Decisión correcta'], [
        aerialRow('Centros laterales', stats.crosses), aerialRow('Juego aéreo frontal', stats.aerial), aerialRow('Balón a la espalda', stats.espalda),
        ['Salidas / 1v1', String(stats.oneVone.n), '—', fmtPct(stats.oneVone.success), fmtPct(stats.oneVone.correctDecision)]])),
    h('section.card',
      h('h2', `Distribución · ${d.n} acciones`),
      h('p.muted', 'Éxito = completado o 2.ª jugada ganada.'),
      table(['', 'Éxito'], distRows)),
    h('section.card',
      h('h2', 'ABP y penaltis'),
      table(['', ''], [
        ['ABP defensivas registradas', String(stats.abpDef)],
        ['Penaltis: parados', fmtPct(stats.penalties)],
        ['Penaltis: goles', String(stats.penalties.goals)],
        ['Penaltis: adivina el lado', fmtPct(stats.penalties.guessed)]])),
  ];
}

export function actionsCSV(actions, matchesById, keepersById) {
  const rows = actions.map(a => {
    const m = matchesById[a.matchId], o = a.points.origen || a.points.punto, d = a.points.destino;
    const r = {
      fecha: m?.date, rival: m?.rival, portero: keepersById[a.keeperId]?.name, parte: a.half, minuto: minuteLabel(a.half, a.t).replace("'", ''),
      tipo: TYPES[a.type].label, origen_x: o?.x, origen_y: o?.y, destino_x: d?.x, destino_y: d?.y,
      porteria: a.points.porteria ?? a.points.lanzamiento, linea_destino: d ? destLine(d.y) : '', nota: a.note,
    };
    for (const k of ATTR_KEYS) r[k] = label(a.type, k, a.attrs[k]);
    return r;
  });
  const cols = ['fecha', 'rival', 'portero', 'parte', 'minuto', 'tipo', ...ATTR_KEYS, 'origen_x', 'origen_y', 'destino_x', 'destino_y', 'porteria', 'linea_destino', 'nota'];
  return toCSV(rows, cols);
}

export const keeperChips = (keepers, current, onPick, allLabel) => h('div.keeper-pick.no-print',
  allLabel ? h('button' + (current == null ? '.on' : ''), { onclick: () => onPick(null) }, allLabel) : null,
  keepers.map(k => h('button' + (current === k.id ? '.on' : ''), { onclick: () => onPick(k.id) }, avatar(k), k.name)));

export async function renderReport(el, matchId, keeperFilter = null) {
  const match = await db.get('matches', matchId);
  if (!match) { el.append(h('p.error', 'Partido no encontrado.')); return; }
  const all = await db.all('keepers');
  const keepers = match.keepers.map(k => all.find(x => x.id === k.keeperId)).filter(Boolean);
  const actions = (await db.actionsOf(matchId)).filter(a => !keeperFilter || a.keeperId === keeperFilter)
    .sort((a, b) => a.half - b.half || a.t - b.t || a.createdAt - b.createdAt);
  const stats = matchStats(actions);
  const kById = Object.fromEntries(all.map(k => [k.id, k]));
  const who = keeperFilter ? kById[keeperFilter].name : keepers.map(k => `${k.name} (${match.keepers.find(x => x.keeperId === k.id).minutes}′)`).join(', ');
  const res = a => {
    const step = TYPES[a.type].steps.find(s => ['resultado', 'intervencion', 'participacion', 'etiqueta'].includes(s.key));
    return [label(a.type, step?.key, a.attrs[step?.key]), a.attrs.evitable && `evitable: ${label('tiro', 'evitable', a.attrs.evitable)}`].filter(Boolean).join(' · ');
  };
  el.append(h('div.page',
    h('div.report-head',
      h('h1', `Informe · ${match.home ? 'vs' : '@'} ${match.rival} ${match.goalsFor}-${match.goalsAgainst}`),
      h('span', { style: 'flex:1' }),
      h('div.row.no-print',
        h('a.btn.small', { href: `#/match/${matchId}/register` }, 'Registrar'),
        h('button.btn.small', { onclick: () => window.print() }, 'PDF'),
        h('button.btn.small', { onclick: () => download(new Blob([actionsCSV(actions, { [matchId]: match }, kById)], { type: 'text/csv' }), `informe-${match.date}-${match.rival.replace(/\W+/g, '_')}.csv`) }, 'CSV'))),
    h('p.muted', [new Date(match.date + 'T12:00').toLocaleDateString('es-ES', { dateStyle: 'long' }), match.competition, match.home ? 'Local' : 'Visitante', who].filter(Boolean).join(' · ')),
    keepers.length > 1 ? keeperChips(keepers, keeperFilter, id => { el.replaceChildren(); renderReport(el, matchId, id); }, 'Todos') : null,
    actions.length ? null : h('p.muted', 'No hay acciones registradas.'),
    statsBlock(stats, actions),
    h('section.card',
      h('h2', `Acciones · ${actions.length} (1.ª parte ${stats.perHalf[1]}, 2.ª parte ${stats.perHalf[2]})`),
      table(['Min', 'Portero', 'Acción', 'Resultado', 'Nota'], actions.map(a => [minuteLabel(a.half, a.t), kById[a.keeperId]?.name || '', TYPES[a.type].label, res(a), a.note || '']))),
  ));
}
