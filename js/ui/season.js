import * as db from '../db.js';
import { h } from './dom.js';
import { seasonStats, fmtPct, per90 } from '../logic.js';
import { s } from './pitch.js';
import { statsBlock, actionsCSV, keeperChips } from './report.js';
import { avatar } from './setup.js';
import { download } from '../backup.js';
import { activeSeasonId } from '../app.js';

const fmt1 = v => (v == null ? '—' : v.toFixed(1).replace('.', ','));
const ddmm = d => d.slice(8, 10) + '/' + d.slice(5, 7);
const SERIES = [
  { key: 'save', label: '% paradas', get: st => st.savePct },
  { key: 'dist', label: '% éxito distribución', get: st => st.dist.total },
  { key: 'cross', label: '% decisión correcta en centros', get: st => st.crosses.correctDecision },
];

// Evolución partido a partido: una sola escala 0–100 %. Puntos con n<3 en hueco; sin datos = corte de línea.
function evoChart(perMatch) {
  const W = 640, H = 220, L = 40, R = 16, T = 14, B = 30;
  const x = i => L + (perMatch.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (perMatch.length - 1));
  const y = v => T + (1 - v) * (H - T - B);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'evo-chart', role: 'img', 'aria-label': 'Evolución por partido' });
  for (const v of [0, .5, 1]) svg.append(
    s('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'grid' }),
    s('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end', class: 'axis' }, `${v * 100} %`));
  perMatch.forEach((r, i) => svg.append(s('text', { x: x(i), y: H - 10, 'text-anchor': 'middle', class: 'axis' }, ddmm(r.match.date))));
  SERIES.forEach((ser, si) => {
    let d = '', pen = false;
    perMatch.forEach((r, i) => {
      const p = ser.get(r.stats);
      if (p.value == null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i)} ${y(p.value)} `; pen = true;
    });
    if (d) svg.append(s('path', { d, class: `line s${si + 1}` }));
    perMatch.forEach((r, i) => {
      const p = ser.get(r.stats);
      if (p.value == null) return;
      svg.append(s('circle', { cx: x(i), cy: y(p.value), r: 5, class: `pt s${si + 1}${p.d < 3 ? ' hollow' : ''}` },
        s('title', {}, `${ddmm(r.match.date)} vs ${r.match.rival} · ${ser.label}: ${fmtPct(p)}`)));
    });
  });
  return h('figure.evo', svg,
    h('div.legend', SERIES.map((ser, i) => h('span', h('i', { class: `s${i + 1}` }), ser.label)), h('span', '○ = menos de 3 acciones (poco fiable)')));
}

export async function renderSeason(el, state) {
  const [seasons, matchesAll, keepers, actionsAll] = await Promise.all([db.all('seasons'), db.all('matches'), db.all('keepers'), db.all('actions')]);
  const st = state || { seasonId: await activeSeasonId(), competition: '', home: '', view: null };
  const rerender = patch => { el.replaceChildren(); renderSeason(el, { ...st, ...patch }); };
  const inSeason = matchesAll.filter(m => m.seasonId === st.seasonId);
  const matches = inSeason.filter(m => (!st.competition || m.competition === st.competition) && (st.home === '' || String(Number(m.home)) === st.home));
  const ids = new Set(matches.map(m => m.id));
  const actions = actionsAll.filter(a => ids.has(a.matchId));
  const played = keepers.filter(k => inSeason.some(m => m.keepers.some(x => x.keeperId === k.id)));
  const view = st.view ?? played[0]?.id ?? 'compare';
  const comps = [...new Set(inSeason.map(m => m.competition).filter(Boolean))];
  const sel = (name, value, opts, onchange) => {
    const e = h('select', { name, onchange: ev => onchange(ev.target.value) }, opts.map(([v, t]) => h('option', { value: v }, t)));
    e.value = value; return e;
  };
  const results = Object.fromEntries(played.map(k => [k.id, seasonStats(matches, actions, k.id)]));
  const mById = Object.fromEntries(matchesAll.map(m => [m.id, m]));
  const kById = Object.fromEntries(keepers.map(k => [k.id, k]));
  const csv = () => {
    const rows = view === 'compare' ? actions : actions.filter(a => a.keeperId === view);
    download(new Blob([actionsCSV(rows, mById, kById)], { type: 'text/csv' }), `temporada-${seasons.find(x => x.id === st.seasonId)?.name}-${view === 'compare' ? 'todos' : kById[view].name.replace(/\W+/g, '_')}.csv`);
  };

  const head = h('div.page',
    h('div.report-head', h('h1', 'Temporada'), h('span', { style: 'flex:1' }),
      h('div.row.no-print', h('button.btn.small', { onclick: () => window.print() }, 'PDF'), h('button.btn.small', { onclick: csv }, 'CSV'))),
    h('div.row.no-print', { style: 'margin-bottom:12px' },
      sel('season', st.seasonId, seasons.map(x => [x.id, x.name]), v => rerender({ seasonId: v, view: null })),
      sel('competition', st.competition, [['', 'Todas las competiciones'], ...comps.map(c => [c, c])], v => rerender({ competition: v })),
      sel('home', st.home, [['', 'Local y visitante'], ['1', 'Solo local'], ['0', 'Solo visitante']], v => rerender({ home: v }))),
    h('p.muted', `${matches.length} partidos con los filtros actuales` + (st.competition ? ` · ${st.competition}` : '') + (st.home ? ` · ${st.home === '1' ? 'local' : 'visitante'}` : '')));
  el.append(head);
  if (!played.length) { head.append(h('p.muted', 'Todavía no hay partidos con porteros en esta temporada.')); return; }
  head.append(h('div.keeper-pick.no-print', { style: 'margin-bottom:12px' },
    played.map(k => h('button' + (view === k.id ? '.on' : ''), { onclick: () => rerender({ view: k.id }) }, avatar(k), k.name)),
    h('button' + (view === 'compare' ? '.on' : ''), { onclick: () => rerender({ view: 'compare' }) }, '⇄ Comparar')));

  if (view === 'compare') {
    const rows = [
      ['Partidos', r => String(r.perMatch.length)],
      ['Minutos', r => String(r.minutes)],
      ['Tiros recibidos / 90', r => fmt1(per90(r.totals.shots, r.minutes))],
      ['Goles encajados / 90', r => fmt1(per90(r.totals.goals, r.minutes))],
      ['% paradas', r => fmtPct(r.totals.savePct)],
      ['Goles evitables', r => String(r.totals.goalsAvoidable)],
      ['Centros: % intervención', r => fmtPct(r.totals.crosses.intervention)],
      ['Centros: % decisión correcta', r => fmtPct(r.totals.crosses.correctDecision)],
      ['Juego aéreo: % éxito', r => fmtPct(r.totals.aerial.success)],
      ['Espalda: % intervención', r => fmtPct(r.totals.espalda.intervention)],
      ['1v1: % éxito', r => fmtPct(r.totals.oneVone.success)],
      ['Distribución: % éxito', r => fmtPct(r.totals.dist.total)],
      ['Distribución a 3.ª línea', r => fmtPct(r.totals.dist.byLine[3])],
      ['Distribución bajo presión alta', r => fmtPct(r.totals.dist.byPressure.alta)],
      ['Penaltis parados', r => fmtPct(r.totals.penalties)],
    ];
    head.append(h('section.card', h('h2', 'Comparación entre porteros'),
      h('table.t.compare', h('thead', h('tr', h('th', 'Métrica'), played.map(k => h('th', k.name)))),
        h('tbody', rows.map(([name, f]) => h('tr', h('td', name), played.map(k => h('td', f(results[k.id])))))))));
    return;
  }

  const k = kById[view], r = results[view];
  const t = r.totals;
  head.append(
    h('section.card.season-keeper',
      h('div.row', avatar(k, 'avatar.big'), h('div', h('h2', k.name), h('span.muted', `${r.perMatch.length} partidos · ${r.minutes} minutos`))),
      h('h3', 'Por 90 minutos'),
      h('div.kpis',
        h('div.kpi', h('b', fmt1(per90(t.shots, r.minutes))), h('span', 'Tiros recibidos / 90')),
        h('div.kpi', h('b', fmt1(per90(t.goals, r.minutes))), h('span', 'Goles encajados / 90')),
        h('div.kpi', h('b', fmt1(per90(t.saves, r.minutes))), h('span', 'Paradas / 90')),
        h('div.kpi', h('b', fmt1(per90(t.dist.n, r.minutes))), h('span', 'Distribuciones / 90')))),
    h('section.card',
      h('h2', 'Evolución partido a partido'),
      r.perMatch.length ? evoChart(r.perMatch) : h('p.muted', 'Sin partidos con estos filtros.'),
      h('table.t.evo', h('thead', h('tr', ['Fecha', 'Rival', 'Min', 'Tiros', '% paradas', 'Goles (evit.)', '% distribución', 'Decisión centros'].map(x => h('th', x)))),
        h('tbody', r.perMatch.map(p => h('tr', [ddmm(p.match.date), p.match.rival, String(p.minutes), String(p.stats.shots), fmtPct(p.stats.savePct),
          `${p.stats.goals} (${p.stats.goalsAvoidable})`, fmtPct(p.stats.dist.total), fmtPct(p.stats.crosses.correctDecision)].map(x => h('td', x))))))),
    h('h2', { style: 'margin:20px 0 10px' }, 'Acumulado de la temporada'),
    ...statsBlock(t, actions.filter(a => a.keeperId === view && r.perMatch.some(p => p.match.id === a.matchId))));
}
