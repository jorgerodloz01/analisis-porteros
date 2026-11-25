import { test } from 'node:test';
import assert from 'node:assert/strict';
import { destLine, minuteLabel, parseMinute, clockSeconds, pct, fmtPct, per90, matchStats, seasonStats, toCSV } from '../js/logic.js';

const A = (type, attrs = {}, points = {}, extra = {}) => ({ id: Math.random() + '', matchId: 'm1', keeperId: 'k1', half: 1, t: 0, type, attrs, points, ...extra });

export const fixture = [
  A('tiro', { resultado: 'gol', evitable: 'si' }, { origen: { x: .5, y: .8 }, porteria: 0 }),
  A('tiro', { resultado: 'blocaje' }, { origen: { x: .5, y: .8 }, porteria: 4 }),
  A('tiro', { resultado: 'fuera_poste' }, { origen: { x: .5, y: .8 }, porteria: 2 }),
  A('penalti', { resultado: 'gol', lado_portero: 'izq' }, { lanzamiento: 5 }),
  A('centro', { decision: 'sale', resultado: 'exito', valoracion: 'correcta' }, { origen: { x: .9, y: .8 } }),
  A('centro', { decision: 'se_queda', resultado: 'fallo', valoracion: 'debia_salir' }, { origen: { x: .9, y: .8 } }),
  A('pase', { resultado: 'completado', altura: 'raso' }, { origen: { x: .5, y: .05 }, destino: { x: .5, y: .5 } }),
  A('pase', { resultado: 'perdido', altura: 'alto' }, { origen: { x: .5, y: .05 }, destino: { x: .5, y: .8 } }),
  A('saque_puerta', { resultado: 'segunda_ganada' }, { origen: { x: .5, y: .05 }, destino: { x: .5, y: .2 } }),
];

test('destLine por tercios', () => {
  assert.equal(destLine(0.1), 1); assert.equal(destLine(0.5), 2); assert.equal(destLine(0.9), 3); assert.equal(destLine(1 / 3), 2);
});

test('minuteLabel', () => {
  assert.equal(minuteLabel(1, 0), "1'"); assert.equal(minuteLabel(2, 125), "48'");
});

test('clockSeconds', () => {
  assert.equal(clockSeconds({ running: true, startedAt: 1000, accumulated: 60 }, 31000), 90);
  assert.equal(clockSeconds({ running: false, startedAt: null, accumulated: 60 }, 31000), 60);
});

test('pct, fmtPct, per90', () => {
  assert.equal(fmtPct(pct(4, 6)), '67 % (4/6)');
  assert.equal(fmtPct(pct(0, 0)), '— (0/0)');
  assert.equal(per90(3, 0), null); assert.equal(per90(3, 45), 6);
});

test('matchStats con fixture', () => {
  const s = matchStats(fixture);
  assert.equal(s.shots, 3); assert.equal(s.onTarget, 2); assert.equal(s.saves, 1);
  assert.equal(s.savePct.value, 0.5); assert.equal(s.goals, 2); assert.equal(s.goalsAvoidable, 1);
  assert.equal(s.goalsNotAvoidable, 0); // penalti gol sin valorar no cuenta como no evitable
  assert.equal(s.crosses.n, 2); assert.equal(s.crosses.intervention.value, 0.5);
  assert.equal(s.crosses.success.value, 1); assert.equal(s.crosses.correctDecision.value, 0.5);
  assert.equal(s.dist.total.value, 2 / 3);
  assert.equal(s.dist.byLine[2].n, 1); assert.equal(s.dist.byLine[2].d, 1); assert.equal(s.dist.byLine[3].n, 0);
  assert.equal(s.penalties.d, 1); assert.equal(s.penalties.goals, 1);
  assert.equal(s.penalties.guessed.value, 0); // tiro a celda 5 (derecha), portero a izq
  assert.deepEqual(s.perHalf, { 1: 9, 2: 0 });
});

const hasNaN = o => typeof o === 'number' ? !Number.isFinite(o) : o && typeof o === 'object' ? Object.values(o).some(hasNaN) : false;
test('matchStats vacío sin NaN', () => {
  assert.equal(hasNaN(matchStats([])), false);
});

test('seasonStats suma minutos y filtra portero', () => {
  const matches = [
    { id: 'm1', date: '2026-10-01', keepers: [{ keeperId: 'k1', minutes: 90 }] },
    { id: 'm2', date: '2026-10-08', keepers: [{ keeperId: 'k1', minutes: 45 }, { keeperId: 'k2', minutes: 45 }] },
    { id: 'm3', date: '2026-10-15', keepers: [{ keeperId: 'k2', minutes: 90 }] },
  ];
  const actions = [...fixture, A('tiro', { resultado: 'gol' }, {}, { matchId: 'm2', keeperId: 'k2' })];
  const r = seasonStats(matches, actions, 'k1');
  assert.equal(r.minutes, 135); assert.equal(r.perMatch.length, 2);
  assert.equal(r.totals.shots, 3);
});

test('toCSV escapa y lleva BOM', () => {
  assert.equal(toCSV([{ a: 'x;y', b: '"q"' }], ['a', 'b']), '﻿a;b\n"x;y";"""q"""\n');
});

test('goles no evitables', () => {
  assert.equal(matchStats([A('tiro', { resultado: 'gol', evitable: 'no' })]).goalsNotAvoidable, 1);
});

test('minuteLabel con añadido', () => {
  assert.equal(minuteLabel(1, 2700), "45+1'"); assert.equal(minuteLabel(1, 2830), "45+3'");
  assert.equal(minuteLabel(2, 2699), "90'"); assert.equal(minuteLabel(2, 2700), "90+1'");
});

test('parseMinute', () => {
  assert.deepEqual(parseMinute('12'), { half: 1, t: 660 });
  assert.deepEqual(parseMinute('45+2'), { half: 1, t: 2760 });
  assert.deepEqual(parseMinute('46'), { half: 2, t: 0 });
  assert.deepEqual(parseMinute(" 90+3' "), { half: 2, t: 2820 });
  for (const bad of ['', 'x', '0', '130', '30+1', '-5']) assert.equal(parseMinute(bad), null, bad);
  for (const [h, t] of [[1, 0], [1, 2760], [2, 0], [2, 2820]]) assert.deepEqual(parseMinute(minuteLabel(h, t)), { half: h, t }, 'ida y vuelta');
});

test('balón a la espalda: mismas métricas que los centros', () => {
  const s = matchStats([
    A('espalda', { decision: 'sale', resultado: 'exito', valoracion: 'correcta' }, { punto: { x: .5, y: .3 } }),
    A('espalda', { decision: 'se_queda', resultado: 'fallo', valoracion: 'debia_salir' }, { punto: { x: .5, y: .3 } }),
  ]);
  assert.equal(s.espalda.n, 2);
  assert.equal(s.espalda.intervention.value, 0.5);
  assert.equal(s.espalda.success.value, 1);
  assert.equal(s.espalda.correctDecision.value, 0.5);
});

test('las marcas de vídeo no cuentan en ninguna estadística', () => {
  const base = matchStats(fixture);
  const conMarca = matchStats([...fixture, A('marca', { etiqueta: 'finalizacion' }), A('marca', {}, {}, { half: 2 })]);
  assert.deepEqual(conMarca, base);
});
