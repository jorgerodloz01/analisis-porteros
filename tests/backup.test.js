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
  const data = { ...empty, matches: [{ id: 'm1' }], actions: [{ id: 'a', matchId: 'm1' }] };
  assert.equal(validateBackup(buildBackup(data)), null);
  assert.equal(validateBackup(JSON.parse(JSON.stringify(buildBackup(empty)))), null);
});
