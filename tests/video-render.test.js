import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clipArgs, titleArgs, labelWindows } from '../video/render.js';

const filterOf = args => args[args.indexOf('-filter_complex') + 1];

test('clipArgs: búsqueda rápida antes de la entrada y duración exacta', () => {
  const args = clipArgs({ video: 'C:/Users/jorge/Downloads/Partido L\'Escala.mp4', start: 650, dur: 14, hasAudio: true, labels: [], out: 'clip_000.mp4' });
  assert.ok(args.indexOf('-ss') < args.indexOf('-i'));
  assert.equal(args[args.indexOf('-ss') + 1], '650.000');
  assert.equal(args[args.indexOf('-i') + 1], "C:/Users/jorge/Downloads/Partido L'Escala.mp4"); // ruta tal cual, sin comillas ni escapes
  assert.equal(args[args.length - 1], 'clip_000.mp4');
  assert.ok(filterOf(args).includes('scale=1920:1080:force_original_aspect_ratio=decrease'));
  assert.ok(filterOf(args).includes('fade=t=out:st=13.75:d=0.25'));
  assert.ok(args.includes('libx264') && args.includes('aac'));
});

test('clipArgs: vídeo sin audio lleva pista silenciosa para poder concatenar', () => {
  const args = clipArgs({ video: 'v.mp4', start: 0, dur: 10, hasAudio: false, labels: [], out: 'c.mp4' });
  assert.ok(args.includes('anullsrc=r=48000:cl=stereo'));
  assert.equal(args[args.lastIndexOf('-map') + 1], '1:a');
});

test('clipArgs: un rótulo por acción, desde archivo de texto y con su intervalo', () => {
  const args = clipArgs({ video: 'v.mp4', start: 0, dur: 19, hasAudio: true, out: 'c.mp4',
    labels: [{ file: 'l_000_0.txt', from: 0, to: 5 }, { file: 'l_000_1.txt', from: 5, to: 19 }] });
  const f = filterOf(args);
  assert.equal(f.match(/drawtext=/g).length, 2);
  assert.ok(f.includes("textfile=l_000_0.txt") && f.includes("enable='between(t,0,5)'"));
  assert.ok(f.includes("enable='between(t,5,19)'"));
  assert.ok(f.includes('fontfile=font.ttf'));
});

test('labelWindows: cada rótulo aparece al empezar su jugada', () => {
  const clip = { start: 652, end: 677, actions: [{ type: 'tiro', at: 8 }, { type: 'tiro', at: 13 }] };
  assert.deepEqual(labelWindows(clip), [{ from: 0, to: 5 }, { from: 5, to: 25 }]);
});

test('titleArgs: portada de 3 s con el mismo formato que los clips', () => {
  const args = titleArgs({ lines: ['t_0.txt', 't_1.txt'], out: 'title.mp4' });
  assert.ok(args.includes('color=c=0x0b1220:s=1920x1080:r=30:d=3'));
  assert.equal(filterOf(args).match(/drawtext=/g).length, 2);
  assert.ok(args.includes('anullsrc=r=48000:cl=stereo'));
});
