import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VENTANAS, actionLabel, buildClips, orderClips, isParada, outputNames } from '../video/clips.js';

const A = (type, half, t, attrs = {}, id = `${type}-${half}-${t}`) => ({ id, matchId: 'm1', keeperId: 'k1', half, t, type, attrs, points: {}, createdAt: t });
const OPTS = { kick1: 60, kick2: 3600, duration: 7000 };

test('ventanas por defecto del diseño', () => {
  assert.deepEqual(VENTANAS.tiro, [10, 4]);
  assert.deepEqual(VENTANAS.centro, [12, 4]);
  assert.deepEqual(VENTANAS.pase, [4, 6]);
  assert.deepEqual(VENTANAS.abp_def, [15, 5]);
  assert.deepEqual(VENTANAS.marca, [12, 4]);
});

test('el clip empieza antes de la marca de la app (pitido + t − antes)', () => {
  const { clips } = buildClips([A('tiro', 1, 600, { resultado: 'blocaje' }), A('pase', 2, 100, { resultado: 'completado' })], OPTS);
  assert.equal(clips.length, 2);
  assert.deepEqual([clips[0].start, clips[0].end], [650, 664]);   // 60 + 600 − 10 / + 4
  assert.deepEqual([clips[1].start, clips[1].end], [3696, 3706]); // 3600 + 100 − 4 / + 6
  assert.equal(clips[0].actions[0].at, 10);
  assert.equal(clips[0].include, true);
});

test('dos acciones seguidas se unen en un clip con dos rótulos', () => {
  const { clips } = buildClips([A('tiro', 1, 600, { resultado: 'rechace_peligroso' }), A('tiro', 1, 605, { resultado: 'blocaje' })], OPTS);
  assert.equal(clips.length, 1);
  assert.deepEqual([clips[0].start, clips[0].end], [650, 669]);
  assert.deepEqual(clips[0].actions.map(a => a.at), [10, 15]);
});

test('acción fuera del vídeo se descarta con aviso; recorte en 0', () => {
  const { clips, descartadas } = buildClips([A('tiro', 2, 5000), A('pase', 1, 2)], { kick1: 1, kick2: 3600, duration: 7000 });
  assert.equal(descartadas.length, 1);
  assert.equal(descartadas[0].type, 'tiro');
  assert.equal(clips[0].start, 0);
});

test('solo cuentan las acciones con pitido de su parte', () => {
  const { clips, descartadas } = buildClips([A('tiro', 2, 10)], { kick1: 60, kick2: null, duration: 7000 });
  assert.equal(clips.length, 0);
  assert.equal(descartadas.length, 1);
});

test('rótulos de acción y de marca', () => {
  assert.equal(actionLabel(A('tiro', 1, 1320, { resultado: 'blocaje' })), "23' · Tiro / parada · Blocaje");
  assert.equal(actionLabel(A('marca', 2, 0, { etiqueta: 'finalizacion' })), "46' · Marca · Finalización sin tiro");
  assert.equal(actionLabel(A('marca', 1, 0)), "1' · Marca");
  assert.equal(actionLabel(A('espalda', 1, 60, { resultado: 'exito' })), "2' · Balón a la espalda · Éxito");
});

test('orden por bloques: Defensa, Distribución, ABP, Marcas', () => {
  const { clips } = buildClips([A('marca', 1, 100), A('pase', 1, 200), A('tiro', 1, 300), A('penalti', 1, 400)], OPTS);
  assert.deepEqual(orderClips(clips, 'bloques').map(c => c.actions[0].type), ['tiro', 'pase', 'penalti', 'marca']);
  assert.deepEqual(orderClips(clips, 'crono').map(c => c.actions[0].type), ['marca', 'pase', 'tiro', 'penalti']);
});

test('paradas: tiros a puerta no goles y penaltis parados', () => {
  assert.ok(isParada(A('tiro', 1, 0, { resultado: 'blocaje' })));
  assert.ok(isParada(A('tiro', 1, 0, { resultado: 'corner' })));
  assert.ok(!isParada(A('tiro', 1, 0, { resultado: 'gol' })));
  assert.ok(!isParada(A('tiro', 1, 0, { resultado: 'fuera_poste' })));
  assert.ok(isParada(A('penalti', 1, 0, { resultado: 'parada' })));
  assert.ok(!isParada(A('centro', 1, 0, { resultado: 'exito' })));
});

test('nombres de archivo con y sin jornada', () => {
  assert.deepEqual(outputNames({ portero: 'Jona', rival: "L'Escala", jornada: '12' }),
    { acciones: "Vídeo Análisis Jona vs L'Escala J12.mp4", paradas: "PARADAS Jona vs L'Escala J12.mp4" });
  assert.equal(outputNames({ portero: 'Jona', rival: 'CE Europa B', jornada: '' }).acciones, 'Vídeo Análisis Jona vs CE Europa B.mp4');
  assert.equal(outputNames({ portero: 'Uri', rival: 'A/B: "C"', jornada: '3' }).paradas, 'PARADAS Uri vs A-B- -C- J3.mp4');
});
