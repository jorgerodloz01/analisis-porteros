import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listVideos, listBackups, isAllowed, outputDirs } from '../video/descubrir.js';

const tmp = () => mkdtemp(join(tmpdir(), 'desc-'));
const touch = async (p, t, size = 10) => { await writeFile(p, Buffer.alloc(size)); await utimes(p, t, t); };

test('vídeos: primero los de partido (>1 GB) por fecha, luego el resto', async () => {
  const d = await tmp();
  await touch(join(d, 'clip corto.mp4'), 3000);
  await touch(join(d, 'notas.txt'), 4000);
  await touch(join(d, 'UE Cornella - L\'Escala - Tactical.mp4'), 1000);
  await touch(join(d, 'Otro partido.MOV'), 2000);
  const list = await listVideos([d], { grande: 5 }); // umbral de prueba: 5 bytes
  assert.deepEqual(list.map(v => v.name), ['clip corto.mp4', 'Otro partido.MOV', "UE Cornella - L'Escala - Tactical.mp4"]);
  const big = await listVideos([d], { grande: 1e9 });
  assert.equal(big.length, 3);
  assert.ok(big[0].size === 10 && typeof big[0].path === 'string' && typeof big[0].mtime === 'number');
});

test('copias: porteros-backup*.json hasta 3 niveles, la más reciente primero; carpeta inexistente no rompe', async () => {
  const d = await tmp();
  await mkdir(join(d, 'a', 'b'), { recursive: true });
  await touch(join(d, 'porteros-backup-2026-11-20.json'), 1000);
  await touch(join(d, 'a', 'b', 'porteros-backup-2026-11-24 (1).json'), 5000);
  await touch(join(d, 'a', 'otra.json'), 6000);
  const list = await listBackups([d, join(d, 'no-existe')]);
  assert.deepEqual(list.map(b => b.name), ['porteros-backup-2026-11-24 (1).json', 'porteros-backup-2026-11-20.json']);
});

test('isAllowed: solo rutas dentro de las carpetas permitidas', () => {
  const roots = ['/home/j/Downloads', '/home/j/OneDrive/Escritorio/VÍDEO ANÁLISIS 26-27'];
  assert.ok(isAllowed('/home/j/Downloads/partido.mp4', roots));
  assert.ok(isAllowed('/home/j/OneDrive/Escritorio/VÍDEO ANÁLISIS 26-27/JONA/x.mp4', roots));
  assert.ok(!isAllowed('/home/j/Downloads/../.ssh/id_rsa', roots));
  assert.ok(!isAllowed('/home/j/Downloads2/x.mp4', roots));
  assert.ok(!isAllowed('', roots));
});

test('carpetas de salida: la del portero y la de sus paradas si existen', async () => {
  const base = await tmp();
  for (const f of ['JONATAN MORILLA', 'PARADAS JONATAN MORILLA', 'URI DALMAU']) await mkdir(join(base, f));
  assert.deepEqual(await outputDirs({ base, portero: 'Jona' }), { acciones: join(base, 'JONATAN MORILLA'), paradas: join(base, 'PARADAS JONATAN MORILLA') });
  assert.deepEqual(await outputDirs({ base, portero: 'Uri Dalmau' }), { acciones: join(base, 'URI DALMAU'), paradas: join(base, 'URI DALMAU') });
  assert.deepEqual(await outputDirs({ base, portero: 'Mauro' }), { acciones: join(base, 'MAURO'), paradas: join(base, 'MAURO') });
  assert.deepEqual(await outputDirs({ base: join(base, 'no-existe'), portero: 'Jona', fallback: '/tmp/dl' }), { acciones: '/tmp/dl', paradas: '/tmp/dl' });
});
