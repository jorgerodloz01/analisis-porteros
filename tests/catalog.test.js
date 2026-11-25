import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TABS, TYPES, missingRequired, visibleSteps, cleanAction } from '../js/catalog.js';

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

test('lado del portero en penalti indica la referencia visual', () => {
  const step = TYPES.penalti.steps.find(s => s.key === 'lado_portero');
  assert.match(step.label, /vist[oa] desde el campo/i);
});

test('cleanAction quita datos de pasos ocultos', () => {
  const a = cleanAction({ type: 'tiro', points: { origen: { x: 0, y: 0 } }, attrs: { resultado: 'blocaje', evitable: 'si' } });
  assert.deepEqual(a.attrs, { resultado: 'blocaje' });
  const b = cleanAction({ type: 'abp_def', points: {}, attrs: { subtipo: 'corner', barrera: '3', intervencion: 'ninguna' } });
  assert.deepEqual(b.attrs, { subtipo: 'corner', intervencion: 'ninguna' });
});

test('balón a la espalda: en Defensa, con decisión y resultado obligatorios', () => {
  assert.ok(TABS.find(t => t.key === 'defensa').types.includes('espalda'));
  assert.deepEqual(missingRequired('espalda', { points: {}, attrs: {} }), ['punto', 'decision', 'resultado']);
  const keys = a => visibleSteps('espalda', a).map(s => s.key);
  assert.ok(!keys({ points: {}, attrs: { decision: 'se_queda' } }).includes('accion'));
  assert.ok(keys({ points: {}, attrs: { decision: 'sale' } }).includes('accion'));
});

test('marca de vídeo: sin pasos obligatorios y fuera de las pestañas', () => {
  assert.ok(TYPES.marca);
  assert.deepEqual(missingRequired('marca', { points: {}, attrs: {} }), []);
  assert.ok(TABS.every(t => !t.types.includes('marca')));
  assert.deepEqual(TYPES.marca.steps.find(s => s.key === 'etiqueta').options.map(o => o.value), ['colocacion_centro', 'finalizacion', 'otra']);
});
