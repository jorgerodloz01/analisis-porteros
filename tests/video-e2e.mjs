// Prueba de extremo a extremo de la herramienta de vídeo: vídeo sintético con reloj impreso, copia de la app sintética,
// servidor real, página real en Chrome y ffmpeg real. Uso: node tests/video-e2e.mjs  (necesita ffmpeg y Playwright).
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const root = fileURLToPath(new URL('..', import.meta.url));
const T = await mkdtemp(join(tmpdir(), 've2e-'));
const dl = join(T, 'Downloads'), icloud = join(T, 'iCloudDrive', 'Porteros'), base = join(T, 'Escritorio', 'VÍDEO ANÁLISIS 26-27');
for (const d of [dl, icloud, join(base, 'JONATAN MORILLA'), join(base, 'PARADAS JONATAN MORILLA')]) await mkdir(d, { recursive: true });

// 12 min, reloj del vídeo impreso arriba a la izquierda; pitidos en 1:00 y 7:00
const video = join(dl, "UE Cornella - L'Escala - Tactical.mp4");
const font = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=15:d=720', '-f', 'lavfi', '-i', 'sine=f=440:d=720',
  '-vf', `drawtext=fontfile=${font}:text='%{pts\\:hms}':x=20:y=20:fontsize=40:fontcolor=white:box=1:boxcolor=black`,
  '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', video]);

const A = (id, half, t, type, attrs) => ({ id, matchId: 'm1', keeperId: 'k1', half, t, type, attrs, points: {}, note: '', createdAt: t });
await writeFile(join(icloud, 'porteros-backup-2026-11-29.json'), JSON.stringify({
  app: 'porteros', version: 1, exportedAt: new Date().toISOString(),
  seasons: [{ id: 's1', name: '2026-27' }],
  keepers: [{ id: 'k1', name: 'Jona Morilla', number: '1', photo: null, active: true }],
  players: [],
  matches: [{ id: 'm1', seasonId: 's1', date: '2026-11-29', rival: "CE L'Hospitalet", home: false, competition: 'Liga', goalsFor: 1, goalsAgainst: 0,
    keepers: [{ keeperId: 'k1', minutes: 90 }], lineup: [], clock: { half: 2, running: false, startedAt: null, accumulated: 0 }, finished: true }],
  actions: [
    A('a1', 1, 120, 'tiro', { resultado: 'blocaje' }), A('a2', 1, 125, 'tiro', { resultado: 'rechace_seguro' }),
    A('a3', 1, 200, 'pase', { resultado: 'completado' }), A('a4', 1, 250, 'marca', { etiqueta: 'finalizacion' }),
    A('a5', 2, 60, 'centro', { decision: 'sale', resultado: 'exito' }), A('a6', 2, 300, 'penalti', { resultado: 'parada' }),
    A('a7', 2, 400, 'tiro', { resultado: 'gol' }), // 7:00 + 400 s queda fuera del vídeo de 12 min
  ],
}));
const cfgPath = join(T, 'config.json');
await writeFile(cfgPath, JSON.stringify({ carpetasVideo: [dl], carpetasCopias: [join(T, 'iCloudDrive'), dl], carpetaSalida: base, puerto: 8799 }));

const srv = spawn('node', [join(root, 'video', 'servidor.mjs')], { env: { ...process.env, VIDEO_CONFIG: cfgPath, NO_ABRIR: '1' }, stdio: 'inherit' });
await new Promise(r => setTimeout(r, 800));
const URL0 = 'http://127.0.0.1:8799/';
try {
  // seguridad y streaming por rangos
  assert.equal((await fetch(URL0 + 'video?path=' + encodeURIComponent('/etc/passwd'))).status, 403);
  const part = await fetch(URL0 + 'video?path=' + encodeURIComponent(video), { headers: { Range: 'bytes=0-99' } });
  assert.equal(part.status, 206); assert.equal((await part.arrayBuffer()).byteLength, 100);

  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL0);
  await page.waitForFunction(() => document.querySelector('#portero option'));
  assert.ok((await page.inputValue('#video')).endsWith('Tactical.mp4'));
  assert.equal(await page.inputValue('#nombre'), 'Jona');
  await page.fill('#k1v', '00:01:00'); await page.dispatchEvent('#k1v', 'change');
  await page.fill('#k2v', '7:00'); await page.dispatchEvent('#k2v', 'change');
  await page.click('#calcular');
  await page.waitForFunction(() => document.querySelectorAll('#tabla tbody tr').length > 0);
  assert.equal(await page.locator('#tabla tbody tr').count(), 5, 'dos tiros unidos + pase + marca + centro + penalti = 5 clips');
  assert.ok((await page.textContent('#resumen')).includes('1 acción(es) fuera del vídeo'));
  assert.ok(await page.locator("#tabla td.acc:has-text(\"3' · Tiro / parada · Blocaje\")").count());
  assert.ok(await page.locator("#tabla td.acc:has-text(\"Marca · Finalización sin tiro\")").count());
  await page.fill('#jornada', '12');
  await page.screenshot({ path: join(T, 'ui.png'), fullPage: true });
  await page.click('#generar');
  await page.waitForSelector('.ok, .error', { timeout: 240000 });
  assert.ok(!(await page.locator('.error').count()), await page.locator('.error').textContent().catch(() => ''));
  await page.screenshot({ path: join(T, 'ui-fin.png'), fullPage: true });
  assert.deepEqual(errors, []);
  // Elegir una copia desde cualquier carpeta con el selector de archivos (sin escribir rutas)
  const fuera = join(T, 'otra carpeta', 'porteros-backup-2026-11-30.json');
  await mkdir(join(T, 'otra carpeta'), { recursive: true });
  const otra = JSON.parse(await readFile(join(icloud, 'porteros-backup-2026-11-29.json'), 'utf8'));
  otra.matches[0].rival = 'Upload FC';
  await writeFile(fuera, JSON.stringify(otra));
  await page.setInputFiles('#backupArchivo', fuera);
  await page.waitForFunction(() => [...document.querySelectorAll('#partido option')].some(o => o.textContent.includes('Upload FC')));
  await page.click('#calcular');
  await page.waitForFunction(() => document.querySelectorAll('#tabla tbody tr').length === 5);
  assert.deepEqual(errors, []);
  await browser.close();

  const dur = f => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
  const outA = join(base, 'JONATAN MORILLA', "Vídeo Análisis Jona vs CE L'Hospitalet J12.mp4");
  const outP = join(base, 'PARADAS JONATAN MORILLA', "PARADAS Jona vs CE L'Hospitalet J12.mp4");
  await access(outA); await access(outP);
  // 3 s portada + clips 25 (dos tiros unidos) + 12 (pase) + 18 (marca) + 20 (centro) + 8 (penalti, cortado al final del vídeo) = 86 s
  // paradas: 3 + 25 + 8 = 36 s
  assert.ok(Math.abs(dur(outA) - 86) < 0.6, `duración acciones ${dur(outA)}`);
  assert.ok(Math.abs(dur(outP) - 36) < 0.6, `duración paradas ${dur(outP)}`);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', '3.5', '-i', outA, '-frames:v', '1', join(T, 'frame-3.5s.jpg')]);
  console.log('OK · archivos en', T);
} finally { srv.kill(); }
