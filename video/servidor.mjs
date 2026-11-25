// Herramienta local de vídeo: página en http://127.0.0.1:8765. Solo escucha en este PC y solo sirve archivos
// de las carpetas permitidas. Uso: node video/servidor.mjs  (o doble clic en «Abrir herramienta de video.cmd»).
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, stat, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, extname, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { validateBackup } from '../js/backup.js';
import { buildClips, orderClips, outputNames, VENTANAS } from './clips.js';
import { renderJob, probe, run } from './render.js';
import { listVideos, listBackups, isAllowed, outputDirs } from './descubrir.js';

const here = dirname(fileURLToPath(import.meta.url));
const home = homedir();

async function loadConfig() {
  let user = {};
  try { user = JSON.parse(await readFile(process.env.VIDEO_CONFIG || join(here, 'config.json'), 'utf8')); } catch { /* sin config: valores por defecto */ }
  const downloads = join(home, 'Downloads');
  let salidaBase = user.carpetaSalida;
  if (!salidaBase) {
    const esc = join(home, 'OneDrive', 'Escritorio');
    const found = (await readdir(esc).catch(() => [])).find(n => /^v[ií]deo an[aá]lisis/i.test(n));
    salidaBase = found ? join(esc, found) : downloads;
  }
  return {
    puerto: user.puerto ?? 8765,
    carpetasVideo: user.carpetasVideo ?? [downloads],
    carpetasCopias: user.carpetasCopias ?? [join(home, 'iCloudDrive'), downloads],
    salidaBase,
    downloads,
    ventanas: { ...VENTANAS, ...(user.ventanas ?? {}) },
    ffmpeg: user.ffmpeg ?? 'ffmpeg',
    ffprobe: user.ffprobe ?? 'ffprobe',
  };
}

const cfg = await loadConfig();
const roots = () => [...cfg.carpetasVideo, ...cfg.carpetasCopias, cfg.salidaBase, cfg.downloads];
const jobs = new Map();
const durations = new Map();

const send = (res, code, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const fail = (res, code, msg) => send(res, code, { error: msg });
const body = req => new Promise((ok, ko) => { let b = ''; req.on('data', d => { b += d; if (b.length > 5e6) ko(new Error('Petición demasiado grande')); }); req.on('end', () => { try { ok(JSON.parse(b || '{}')); } catch (e) { ko(e); } }); });
const needAllowed = p => { if (!isAllowed(p, roots())) throw Object.assign(new Error('Ruta fuera de las carpetas permitidas.'), { code: 403 }); return p; };

async function readBackup(path) {
  needAllowed(path);
  const o = JSON.parse(await readFile(path, 'utf8'));
  const err = validateBackup(o);
  if (err) throw Object.assign(new Error(err), { code: 400 });
  return o;
}
async function duration(video) {
  const s = await stat(video);
  const key = `${video}|${s.size}|${s.mtimeMs}`;
  if (!durations.has(key)) durations.set(key, (await probe(video, cfg.ffprobe)).duration);
  return durations.get(key);
}
const ffmpegOk = () => run(cfg.ffmpeg, ['-version']).then(() => true, () => false);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska' };

async function streamVideo(req, res, path) {
  needAllowed(path);
  const { size } = await stat(path);
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  const type = MIME[extname(path).toLowerCase()] || 'application/octet-stream';
  if (!m) { res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes' }); createReadStream(path).pipe(res); return; }
  const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  if (start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return; }
  res.writeHead(206, { 'Content-Type': type, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes' });
  createReadStream(path, { start, end }).pipe(res);
}

const fmtDate = d => new Date(d + 'T12:00').toLocaleDateString('es-ES');

async function generar(p) {
  const video = needAllowed(p.videoPath);
  const o = await readBackup(p.backupPath);
  const match = o.matches.find(m => m.id === p.matchId);
  if (!match) throw Object.assign(new Error('Partido no encontrado en la copia.'), { code: 400 });
  const dur = await duration(video);
  const clips = orderClips((p.clips || []).filter(c => c.include !== false && Number.isFinite(c.start) && Number.isFinite(c.end))
    .map(c => ({ ...c, start: Math.max(0, c.start), end: Math.min(dur, c.end) })).filter(c => c.end - c.start >= 1), p.orden);
  if (!clips.length) throw Object.assign(new Error('No hay clips marcados para generar.'), { code: 400 });
  const portero = String(p.portero || 'Portero').trim();
  const names = outputNames({ portero, rival: match.rival, jornada: p.jornada });
  const dirs = await outputDirs({ base: cfg.salidaBase, portero, fallback: cfg.downloads });
  const linea2 = `${match.home ? 'vs' : '@'} ${match.rival}${p.jornada ? ` · J${p.jornada}` : ''} · ${fmtDate(match.date)}`;
  const nAcc = clips.reduce((s, c) => s + c.actions.length, 0);
  const nPar = clips.reduce((s, c) => s + c.actions.filter(a => a.parada).length, 0);
  const id = Math.random().toString(36).slice(2);
  const job = { fase: 'Empezando…', hecho: 0, total: clips.length + 3 };
  jobs.set(id, job);
  renderJob({
    video, clips, ffmpeg: cfg.ffmpeg, ffprobe: cfg.ffprobe,
    titles: { acciones: [`Vídeo Análisis · ${portero}`, linea2, `${nAcc} acciones`], paradas: [`Paradas · ${portero}`, linea2, `${nPar} paradas`] },
    outAcciones: join(dirs.acciones, names.acciones),
    outParadas: p.paradas ? join(dirs.paradas, names.paradas) : null,
    onProgress: s => Object.assign(job, s),
  }).then(r => Object.assign(job, { fase: 'Terminado', hecho: job.total, salidas: r }), e => Object.assign(job, { fase: 'Error', error: e.message }));
  return { jobId: id };
}

function abrir(path) {
  needAllowed(path);
  if (process.platform === 'win32') spawn('explorer.exe', [`/select,${path}`], { detached: true, stdio: 'ignore' }).unref();
  else spawn('xdg-open', [dirname(path)], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const q = k => url.searchParams.get(k);
  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/ui/'))) {
      const file = url.pathname === '/' ? 'index.html' : basename(url.pathname);
      return send(res, 200, await readFile(join(here, 'ui', file)), MIME[extname(file)] || 'text/plain');
    }
    if (req.method === 'GET' && url.pathname === '/api/estado-inicial') {
      return send(res, 200, { ffmpeg: await ffmpegOk(), videos: await listVideos(cfg.carpetasVideo), backups: await listBackups(cfg.carpetasCopias), salidaBase: cfg.salidaBase });
    }
    if (req.method === 'GET' && url.pathname === '/api/backup') {
      const o = await readBackup(q('path'));
      const kName = Object.fromEntries(o.keepers.map(k => [k.id, k.name]));
      return send(res, 200, {
        matches: o.matches.sort((a, b) => b.date.localeCompare(a.date)).map(m => ({ id: m.id, date: m.date, rival: m.rival, home: m.home,
          keepers: m.keepers.map(k => ({ id: k.keeperId, name: kName[k.keeperId] || '?', acciones: o.actions.filter(a => a.matchId === m.id && a.keeperId === k.keeperId).length })) })),
      });
    }
    if (req.method === 'GET' && url.pathname === '/video') return await streamVideo(req, res, q('path'));
    if (req.method === 'POST' && url.pathname === '/api/clips') {
      const p = await body(req);
      const o = await readBackup(p.backupPath);
      const dur = await duration(needAllowed(p.videoPath));
      const acts = o.actions.filter(a => a.matchId === p.matchId && a.keeperId === p.keeperId);
      const { clips, descartadas } = buildClips(acts, { kick1: p.kick1, kick2: p.kick2, duration: dur, ventanas: cfg.ventanas });
      return send(res, 200, { clips, descartadas: descartadas.length, acciones: acts.length, duration: dur });
    }
    if (req.method === 'POST' && url.pathname === '/api/generar') return send(res, 200, await generar(await body(req)));
    if (req.method === 'GET' && url.pathname === '/api/trabajo') return jobs.has(q('id')) ? send(res, 200, jobs.get(q('id'))) : fail(res, 404, 'Trabajo no encontrado');
    if (req.method === 'POST' && url.pathname === '/api/abrir') { abrir((await body(req)).path); return send(res, 200, { ok: true }); }
    fail(res, 404, 'No encontrado');
  } catch (e) {
    if (!res.headersSent) fail(res, e.code === 403 || e.code === 400 ? e.code : 500, e.code === 'ENOENT' ? 'No se encuentra el archivo.' : e.message);
  }
});

const url = `http://127.0.0.1:${cfg.puerto}/`;
const openBrowser = () => {
  if (process.env.NO_ABRIR) return;
  const p = process.platform === 'win32' ? spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' })
    : spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
  p.on('error', () => {}); p.unref();
};
server.on('error', e => {
  if (e.code === 'EADDRINUSE') { console.log(`La herramienta ya estaba abierta: ${url}`); openBrowser(); process.exit(0); }
  throw e;
});
server.listen(cfg.puerto, '127.0.0.1', () => {
  console.log(`Herramienta de vídeo lista en ${url}\nCarpeta de salida: ${cfg.salidaBase}\nDeja esta ventana abierta mientras la usas.`);
  openBrowser();
});
