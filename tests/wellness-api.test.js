import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elegirFormulario, idDesdeEnlace, todasLasRespuestas, llamarApi } from '../wellness/tally-api.js';

test('elegirFormulario: el que tiene «wellness» en el nombre, acepte la forma que acepte la API', () => {
  const lista = { items: [{ id: 'aaa', name: 'Inscripción campus' }, { id: 'wQx1', name: "Cuestionario Wellness L'Escala" }] };
  assert.equal(elegirFormulario(lista), 'wQx1');
  assert.equal(elegirFormulario([{ id: 'b', title: 'WELLNESS diario' }]), 'b');
  assert.equal(elegirFormulario({ items: [{ id: 'x', name: 'Otra cosa' }] }), null);
  assert.equal(elegirFormulario({ items: [{ id: 'x', name: 'Wellness 1' }, { id: 'y', name: 'Wellness 2' }] }), null, 'si hay dos, no adivina');
});

test('idDesdeEnlace: vale el enlace de compartir o el del panel', () => {
  assert.equal(idDesdeEnlace('https://tally.so/r/wQx1Ab'), 'wQx1Ab');
  assert.equal(idDesdeEnlace('https://tally.so/forms/wQx1Ab/submissions'), 'wQx1Ab');
  assert.equal(idDesdeEnlace('wQx1Ab'), 'wQx1Ab');
});

test('todasLasRespuestas: recorre las páginas hasta hasMore=false y junta preguntas y envíos', async () => {
  const pedidas = [];
  const api = async ruta => {
    pedidas.push(ruta);
    const page = Number(new URL('https://x' + ruta).searchParams.get('page'));
    return { page, hasMore: page < 3, questions: [{ id: 'q' + page, title: 'T' }], submissions: [{ id: 's' + page }] };
  };
  const r = await todasLasRespuestas(api, 'wQx1');
  assert.deepEqual(r.submissions.map(s => s.id), ['s1', 's2', 's3']);
  assert.deepEqual(r.questions.map(q => q.id), ['q1', 'q2', 'q3']);
  assert.ok(pedidas.every(p => p.startsWith('/forms/wQx1/submissions?') && p.includes('limit=500') && p.includes('filter=completed')));
});

test('llamarApi: clave mala → mensaje claro (no el error crudo)', async () => {
  const fetchFalso = async () => ({ ok: false, status: 401, text: async () => 'Unauthorized' });
  await assert.rejects(llamarApi('mala', '/forms', fetchFalso), /clave de Tally no es válida/);
  const ok = async (url, o) => ({ ok: true, status: 200, json: async () => ({ url, auth: o.headers.Authorization }) });
  assert.deepEqual(await llamarApi('k1', '/forms', ok), { url: 'https://api.tally.so/forms', auth: 'Bearer k1' });
});

test('llamarApi: POST con cuerpo JSON (crear formularios)', async () => {
  let visto;
  const f = async (url, o) => { visto = o; return { ok: true, status: 201, json: async () => ({ id: 'nuevo' }) }; };
  assert.deepEqual(await llamarApi('k1', '/forms', f, { method: 'POST', body: { status: 'PUBLISHED', blocks: [] } }), { id: 'nuevo' });
  assert.equal(visto.method, 'POST');
  assert.equal(visto.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(visto.body), { status: 'PUBLISHED', blocks: [] });
});

test('llamarApi: si Tally rechaza el formulario (400), se ve su motivo', async () => {
  const f = async () => ({ ok: false, status: 400, text: async () => '{"message":"Invalid payload for block"}' });
  await assert.rejects(llamarApi('k1', '/forms', f, { method: 'POST', body: {} }), /400.*Invalid payload/);
});
