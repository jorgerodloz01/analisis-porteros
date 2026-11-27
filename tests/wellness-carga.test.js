import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rpeDesdeApi, sesionesDesdeApi, filasCarga, fechaDeTexto } from '../wellness/carga.js';
import { formularioRpe, formularioSesion, RPE_OPCIONES } from '../wellness/formularios.js';

const PORTEROS = ['Jonatan Morilla', 'Oriol Dalmau', 'Lluis Tarrés'];
const api = (titulos, envios) => ({
  questions: titulos.map((t, i) => ({ id: 'q' + i, title: t })),
  submissions: envios.map((e, j) => ({ id: e.id ?? 's' + j, isCompleted: true, submittedAt: e.at,
    responses: e.r.map((v, i) => (v === undefined ? null : { questionId: 'q' + i, answer: v, formattedAnswer: String(v) })).filter(Boolean) })),
});
const T_RPE = ['Nombre', '¿Cómo de dura ha sido la sesión? (0-10)', 'Comentario (opcional)'];
const T_SES = ['Microciclo', 'Tipo de sesión', 'Duración (minutos)', 'Fecha (solo si no es hoy, dd/mm)', 'Observaciones (opcional)'];

test('RPE: número de la opción elegida, 0 incluido; nombre al del Excel', () => {
  const { filas, avisos } = rpeDesdeApi(api(T_RPE, [
    { at: '2026-11-25T18:40:00Z', r: ['Jonatan Morilla', '7 · Muy dura', 'Me cargó el aductor'] },
    { at: '2026-11-25T18:45:00Z', r: ['Uri', '0 · Reposo'] },
  ]), { porteros: PORTEROS });
  assert.deepEqual(filas.map(f => [f.fecha, f.portero, f.rpe, f.comentario]), [
    ['2026-11-25', 'Jonatan Morilla', 7, 'Me cargó el aductor'], ['2026-11-25', 'Oriol Dalmau', 0, '']]);
  assert.deepEqual(avisos, []);
});

test('RPE fuera de 0-10 o vacío: no se usa y avisa', () => {
  const { filas, avisos } = rpeDesdeApi(api(T_RPE, [{ at: '2026-11-25T18:40:00Z', r: ['Jonatan Morilla', '12'] }]), { porteros: PORTEROS });
  assert.equal(filas.length, 0);
  assert.equal(avisos.length, 1);
});

test('RPE: dos envíos del mismo portero y día → vale el último', () => {
  const { filas } = rpeDesdeApi(api(T_RPE, [
    { id: 'a', at: '2026-11-25T18:40:00Z', r: ['Jonatan Morilla', '5 · Dura'] },
    { id: 'b', at: '2026-11-25T19:10:00Z', r: ['Jonatan Morilla', '6'] },
  ]), { porteros: PORTEROS });
  assert.deepEqual(filas.map(f => [f.id, f.rpe]), [['b', 6]]);
});

test('fechaDeTexto: dd/mm con el año del envío; si cae en el futuro, el año anterior', () => {
  assert.equal(fechaDeTexto('24/11', '2026-11-25'), '2026-11-24');
  assert.equal(fechaDeTexto('24/11/2026', '2026-11-25'), '2026-11-24');
  assert.equal(fechaDeTexto('30/12', '2027-01-02'), '2026-12-30');
  assert.equal(fechaDeTexto('', '2026-11-25'), null);
  assert.equal(fechaDeTexto('mañana', '2026-11-25'), null);
});

test('Sesión del día: MD, tipo y minutos; la fecha escrita manda sobre la del envío', () => {
  const { sesiones, avisos } = sesionesDesdeApi(api(T_SES, [
    { at: '2026-11-25T19:30:00Z', r: ['MD-4', 'Campo', '75'] },
    { at: '2026-11-27T08:00:00Z', r: ['MD-2', 'Campo + gimnasio', '90 min', '26/11', 'Sesión con el primer equipo'] },
  ]));
  assert.deepEqual(sesiones.get('2026-11-25'), { microciclo: 'MD-4', tipo: 'Campo', duracion: 75, observaciones: '' });
  assert.deepEqual(sesiones.get('2026-11-26'), { microciclo: 'MD-2', tipo: 'Campo + gimnasio', duracion: 90, observaciones: 'Sesión con el primer equipo' });
  assert.deepEqual(avisos, []);
});

test('filasCarga: cada RPE con los datos de su sesión; sin sesión, la fila va igual (sin minutos)', () => {
  const rpes = [
    { id: 'a', fecha: '2026-11-25', portero: 'Jonatan Morilla', rpe: 7, comentario: 'Aductor' },
    { id: 'b', fecha: '2026-11-25', portero: 'Oriol Dalmau', rpe: 5, comentario: '' },
    { id: 'c', fecha: '2026-11-27', portero: 'Jonatan Morilla', rpe: 4, comentario: '' },
  ];
  const sesiones = new Map([['2026-11-25', { microciclo: 'MD-4', tipo: 'Campo', duracion: 75, observaciones: 'Doble sesión' }]]);
  const { filas, sinSesion } = filasCarga(rpes, sesiones);
  assert.deepEqual(filas[0], { fecha: '2026-11-25', portero: 'Jonatan Morilla', microciclo: 'MD-4', tipo: 'Campo', duracion: 75, rpe: 7, observaciones: 'Doble sesión · Aductor' });
  assert.equal(filas[2].duracion, null);
  assert.deepEqual(sinSesion, ['2026-11-27']);
});

test('formularios: bloques con uuid únicos, opciones del desplegable con el mismo grupo e índices desde 0', () => {
  for (const f of [formularioRpe(PORTEROS), formularioSesion()]) {
    assert.equal(f.status, 'PUBLISHED');
    const uuids = f.blocks.map(b => b.uuid);
    assert.equal(new Set(uuids).size, uuids.length, 'uuid únicos');
    assert.equal(f.blocks[0].type, 'FORM_TITLE');
    const grupos = Map.groupBy(f.blocks.filter(b => b.type === 'DROPDOWN_OPTION'), b => b.groupUuid);
    for (const opciones of grupos.values()) {
      assert.deepEqual(opciones.map(o => o.payload.index), opciones.map((_, i) => i));
      assert.equal(opciones[0].payload.isFirst, true);
      assert.equal(opciones.at(-1).payload.isLast, true);
      assert.ok(opciones.every(o => o.groupType === 'DROPDOWN'));
    }
  }
  const rpe = formularioRpe(PORTEROS);
  const textos = rpe.blocks.filter(b => b.type === 'DROPDOWN_OPTION').map(b => b.payload.text);
  assert.deepEqual(textos.slice(0, 3), PORTEROS);
  assert.deepEqual(textos.slice(3), RPE_OPCIONES);
  assert.equal(RPE_OPCIONES.length, 11);
  assert.equal(RPE_OPCIONES[0], '0 · Reposo');
  assert.equal(RPE_OPCIONES[10], '10 · Máxima');
});
