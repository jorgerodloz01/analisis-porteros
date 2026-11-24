import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TABS, TYPES, missingRequired, visibleSteps } from '../js/catalog.js';

test('todos los tipos de las pestañas existen', () => {
  for (const tab of TABS) for (const t of tab.types) assert.ok(TYPES[t], t);
});

test('missingRequired tiro', () => {
  assert.deepEqual(missingRequired('tiro', { points: {}, attrs: {} }), ['origen', 'porteria', 'resultado']);
  assert.deepEqual(missingRequired('tiro', { points: { origen: { x: 0, y: 0 }, porteria: 0 }, attrs: { resultado: 'gol' } }), []);
});

test('opciones únicas por paso', () => {
  for (const [k, t] of Object.entries(TYPES)) for (const s of t.steps) if (s.options) {
    const v = s.options.map(o => o.value);
    assert.equal(new Set(v).size, v.length, `${k}.${s.key}`);
  }
});

test('evitable solo visible si gol', () => {
  const keys = attrs => visibleSteps('tiro', { points: {}, attrs }).map(s => s.key);
  assert.ok(!keys({ resultado: 'blocaje' }).includes('evitable'));
  assert.ok(keys({ resultado: 'gol' }).includes('evitable'));
  assert.ok(!keys({}).includes('evitable'));
});

test('barrera oculta en córner', () => {
  const keys = attrs => visibleSteps('abp_def', { points: {}, attrs }).map(s => s.key);
  assert.ok(!keys({ subtipo: 'corner' }).includes('barrera'));
  assert.ok(keys({ subtipo: 'falta_frontal' }).includes('barrera'));
});
