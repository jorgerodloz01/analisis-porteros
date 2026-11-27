import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fechaMadrid, horasSueno, aPortero, desdeApi, desdeCsv, deduplicar, parseCsv } from '../wellness/mapeo.js';

const PORTEROS = ['Jonatan Morilla', 'Oriol Dalmau'];

// Títulos tal cual están en el formulario «Cuestionario Wellness L'Escala» (export de julio).
const T = {
  nombre: 'Nombre:',
  sueno: 'Nivel de sueño (1- He dormido perfecto y 5- He dormido fatal):',
  horas: '¿Cuántas horas has dormido?',
  ff: 'Nivel de fatiga física (1- No tengo nada de fatiga y 5- Estoy muy fatigado):',
  fm: 'Nivel de fatiga mental (1- No tengo nada de fatiga y 5- Estoy muy fatigado):',
  estres: 'Nivel de estrés (1- No tengo nada de estrés y 5- Estoy hasta arriba de estrés):',
  dolor10: 'Nivel de dolor muscular/articular: (1- No tengo nada de dolor y 10- No puedo entrenar del dolor)',
  dolor5: 'Nivel de dolor muscular/articular: (1- No tengo nada de dolor y 5- No puedo entrenar del dolor)',
  tiesura: 'Tiesura general (1- Estoy fresco como una lechuga. 5- Estoy mas tieso que una tabla de madera):',
  molTexto: 'En caso de tener alguna molestia física, ¿Dónde es? Sed muy precisos con la información (Por ejemplo: Rodilla derecha), si no tenéis molestia poned "Nada"',
  molZonas: 'En caso de tener alguna molestia física, ¿Dónde es?',
};

function payload(subs, { dolor = 'dolor10' } = {}) {
  const keys = ['nombre', 'sueno', 'horas', 'ff', 'fm', 'estres', dolor, 'tiesura', 'molTexto', 'molZonas'];
  return {
    questions: keys.map(k => ({ id: 'q_' + k, title: T[k], type: 'X', fields: [] })),
    submissions: subs.map((s, i) => ({
      id: s.id ?? 'sub' + i, isCompleted: true, submittedAt: s.at,
      responses: Object.entries(s.r).map(([k, v]) => ({ questionId: 'q_' + (k === 'dolor' ? dolor : k), answer: v, formattedAnswer: Array.isArray(v) ? v.join(', ') : String(v) })),
    })),
  };
}
const R = (over = {}) => ({ nombre: 'Jonatan Morilla', sueno: 2, horas: '+ 8 horas', ff: 3, fm: 2, estres: 1, dolor: 4, tiesura: 2, molTexto: 'Nada', molZonas: ['Sin dolor'], ...over });

test('fechaMadrid: el día y la hora salen en hora de Madrid (cambia el día pasada la medianoche)', () => {
  assert.deepEqual(fechaMadrid('2026-11-26T23:30:00.000Z'), { fecha: '2026-11-27', hora: '00:30' });
  assert.deepEqual(fechaMadrid('2026-07-03T09:41:31.000Z'), { fecha: '2026-07-03', hora: '11:41' });
  assert.deepEqual(fechaMadrid('2026-07-03 11:41:31'), { fecha: '2026-07-03', hora: '13:41' }); // formato del CSV, en UTC
});

test('horasSueno: las opciones del formulario actual van al centro de su franja', () => {
  assert.equal(horasSueno('Menos de 5 horas'), 4.5);
  assert.equal(horasSueno('5 - 6 horas'), 5.5);
  assert.equal(horasSueno('7 - 8 horas'), 7.5);
  assert.equal(horasSueno('+ 8 horas'), 8.5);
});

test('horasSueno: número aunque venga como texto', () => {
  assert.equal(horasSueno('7 horas'), 7);
  assert.equal(horasSueno('6,5'), 6.5);
  assert.equal(horasSueno(7), 7);
  assert.equal(horasSueno('no sé'), null);
});

test('aPortero: nombre del Excel aunque escriban el apodo, mayúsculas o sin tildes', () => {
  assert.equal(aPortero('jona', PORTEROS), 'Jonatan Morilla');
  assert.equal(aPortero('  JONATAN morilla ', PORTEROS), 'Jonatan Morilla');
  assert.equal(aPortero('Uri', PORTEROS), 'Oriol Dalmau');
  assert.equal(aPortero('Oriol', PORTEROS), 'Oriol Dalmau');
  assert.equal(aPortero('Lluís Tarrés', PORTEROS), 'Lluís Tarrés'); // desconocido: se queda como lo escribió
});

test('desdeApi: una respuesta completa se convierte en la fila de WELLNESS', () => {
  const { filas, avisos } = desdeApi(payload([{ id: 'abc', at: '2026-11-27T08:05:00.000Z', r: R() }]), { porteros: PORTEROS });
  assert.equal(filas.length, 1);
  const f = filas[0];
  assert.equal(f.id, 'abc');
  assert.equal(f.fecha, '2026-11-27');
  assert.equal(f.portero, 'Jonatan Morilla');
  assert.deepEqual([f.sueno, f.horas, f.fatigaFisica, f.fatigaMental, f.estres, f.tiesura], [2, 8.5, 3, 2, 1, 2]);
  assert.equal(f.dolor, 2, 'dolor 4/10 → 2/5');
  assert.match(f.observaciones, /Dolor 4\/10 → 2\/5/);
  assert.ok(!/Nada|Sin dolor/.test(f.observaciones), 'sin molestias no ensucia las observaciones');
  assert.deepEqual(avisos, []);
});

test('dolor 1-10 → 1-5 con la tabla 1-2→1, 3-4→2, 5-6→3, 7-8→4, 9-10→5', () => {
  const subs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d, i) => ({ id: 's' + d, at: `2026-11-${10 + i}T08:00:00Z`, r: R({ dolor: d }) }));
  const { filas } = desdeApi(payload(subs), { porteros: PORTEROS });
  assert.deepEqual(filas.map(f => f.dolor), [1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
});

test('si el formulario ya pregunta el dolor de 1 a 5, no se convierte', () => {
  const { filas } = desdeApi(payload([{ at: '2026-11-27T08:00:00Z', r: R({ dolor: 4 }) }], { dolor: 'dolor5' }), { porteros: PORTEROS });
  assert.equal(filas[0].dolor, 4);
  assert.ok(!/Dolor/.test(filas[0].observaciones));
});

test('las molestias van a Observaciones: zonas marcadas y texto', () => {
  const { filas } = desdeApi(payload([{ at: '2026-11-27T08:00:00Z', r: R({ molTexto: 'Me molesta al golpear', molZonas: ['Aductor izquierdo', 'Pubis'] }) }]), { porteros: PORTEROS });
  assert.match(filas[0].observaciones, /Molestias: Aductor izquierdo, Pubis/);
  assert.match(filas[0].observaciones, /Me molesta al golpear/);
});

test('valor fuera de escala: celda vacía y aviso (no se inventa)', () => {
  const { filas, avisos } = desdeApi(payload([{ at: '2026-11-27T08:00:00Z', r: R({ ff: 7 }) }]), { porteros: PORTEROS });
  assert.equal(filas[0].fatigaFisica, null);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /Fatiga física/);
});

test('portero que no está en la lista: entra igualmente y avisa', () => {
  const { filas, avisos } = desdeApi(payload([{ at: '2026-11-27T08:00:00Z', r: R({ nombre: 'Lluís Tarrés' }) }]), { porteros: PORTEROS });
  assert.equal(filas[0].portero, 'Lluís Tarrés');
  assert.match(avisos.join(' '), /Lluís Tarrés/);
});

test('envíos incompletos (isCompleted false) se ignoran', () => {
  const p = payload([{ at: '2026-11-27T08:00:00Z', r: R() }]);
  p.submissions[0].isCompleted = false;
  assert.equal(desdeApi(p, { porteros: PORTEROS }).filas.length, 0);
});

test('deduplicar: dos envíos del mismo portero el mismo día → se queda el último', () => {
  const { filas } = desdeApi(payload([
    { id: 'pronto', at: '2026-11-27T07:00:00Z', r: R({ sueno: 5 }) },
    { id: 'tarde', at: '2026-11-27T09:00:00Z', r: R({ sueno: 1 }) },
    { id: 'uri', at: '2026-11-27T08:00:00Z', r: R({ nombre: 'Uri' }) },
  ]), { porteros: PORTEROS });
  const r = deduplicar(filas);
  assert.equal(r.filas.length, 2);
  assert.equal(r.filas.find(f => f.portero === 'Jonatan Morilla').id, 'tarde');
  assert.deepEqual(r.descartados, ['pronto']);
});

test('parseCsv: comillas, comas y saltos dentro de un campo', () => {
  assert.deepEqual(parseCsv('a,b,c\n1,"dos, tres","x ""y""\nz"\n'), [['a', 'b', 'c'], ['1', 'dos, tres', 'x "y"\nz']]);
});

test('desdeCsv: el export real de Tally (julio) da la misma fila que la API', () => {
  const head = ['Submission ID', 'Respondent ID', 'Submitted at', T.nombre, T.sueno, T.horas, T.ff, T.fm, T.estres, T.dolor10, T.tiesura, T.molTexto, T.molZonas,
    T.molZonas + ' (Hombro izquierdo)', T.molZonas + ' (Pubis)', T.molZonas + ' (Sin dolor)'];
  const row = ['5Xvyo7M', 'PdPGDJx', '2026-07-03 11:41:31', 'Jonatan Morilla', '2', '+ 8 horas', '4', '3', '3', '2', '2', '', 'Sin dolor', 'false', 'false', 'true'];
  const csv = '﻿' + [head, row].map(r => r.map(v => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(',')).join('\n');
  const { filas } = desdeCsv(csv, { porteros: PORTEROS });
  assert.equal(filas.length, 1);
  const f = filas[0];
  assert.deepEqual([f.id, f.fecha, f.portero, f.sueno, f.horas, f.fatigaFisica, f.fatigaMental, f.estres, f.dolor, f.tiesura], ['5Xvyo7M', '2026-07-03', 'Jonatan Morilla', 2, 8.5, 4, 3, 3, 1, 2]);
  assert.ok(!/Molestias/.test(f.observaciones));
});

test('escalas de estrellas: vale el número aunque Tally lo dé como «3 estrellas»', () => {
  const p = payload([{ at: '2026-11-27T08:00:00Z', r: R() }], { dolor: 'dolor5' });
  for (const r of p.submissions[0].responses) if (typeof r.answer === 'number') r.formattedAnswer = `${r.answer} estrellas`;
  const { filas, avisos } = desdeApi(p, { porteros: PORTEROS });
  assert.deepEqual([filas[0].sueno, filas[0].fatigaFisica, filas[0].dolor], [2, 3, 4]);
  assert.deepEqual(avisos, []);
  for (const r of p.submissions[0].responses) if (typeof r.answer === 'number') { r.answer = null; }
  assert.equal(desdeApi(p, { porteros: PORTEROS }).filas[0].sueno, 2, 'solo con el texto también');
});

test('portero que no está en la lista: un solo aviso aunque envíe muchos días', () => {
  const subs = [1, 2, 3].map(d => ({ at: `2026-11-2${d}T08:00:00Z`, r: R({ nombre: 'Lluis Tarrés' }) }));
  const { filas, avisos } = desdeApi(payload(subs), { porteros: PORTEROS });
  assert.equal(filas.length, 3);
  assert.equal(avisos.filter(a => a.includes('Lluis Tarrés')).length, 1);
});
