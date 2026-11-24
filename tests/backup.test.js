import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateBackup, buildBackup } from '../js/backup.js';

const empty = { seasons: [], keepers: [], players: [], matches: [], actions: [] };

test('rechaza archivos que no son copias válidas', () => {
  for (const bad of [null, {}, 'x', { app: 'otra', version: 1, ...empty }, { app: 'porteros', version: 2, ...empty },
    { app: 'porteros', version: 1, ...empty, actions: undefined },
    { app: 'porteros', version: 1, ...empty, actions: [{ id: 'a', matchId: 'nope' }] }]) {
    const r = validateBackup(bad);
    assert.equal(typeof r, 'string'); assert.ok(r.length > 0);
  }
});

test('acepta copia válida', () => {
  const data = { ...empty, matches: [{ id: 'm1', date: '2026-10-01', keepers: [], clock: {} }], actions: [{ id: 'a', matchId: 'm1', type: 'tiro', half: 1, t: 0, points: {}, attrs: {} }] };
  assert.equal(validateBackup(buildBackup(data)), null);
  assert.equal(validateBackup(JSON.parse(JSON.stringify(buildBackup(empty)))), null);
});

test('rechaza registros sin id o con campos clave ausentes, sin lanzar', () => {
  const ok = { app: 'porteros', version: 1, seasons: [], keepers: [], players: [], matches: [], actions: [] };
  const m = { id: 'm1', date: '2026-10-01', keepers: [], clock: { half: 1, running: false, startedAt: null, accumulated: 0 } };
  const cases = [
    { ...ok, actions: [null] },
    { ...ok, seasons: [{ name: 'x' }] },
    { ...ok, matches: [{ id: 'm1' }] },
    { ...ok, matches: [m], actions: [{ matchId: 'm1', type: 'tiro', half: 1, t: 0 }] },
    { ...ok, matches: [m], actions: [{ id: 'a', matchId: 'm1', half: 1, t: 0 }] },
  ];
  for (const c of cases) assert.equal(typeof validateBackup(c), 'string', JSON.stringify(c));
  assert.equal(validateBackup({ ...ok, matches: [m], actions: [{ id: 'a', matchId: 'm1', type: 'tiro', half: 1, t: 0, points: {}, attrs: {} }] }), null);
});
