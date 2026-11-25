// Busca vídeos y copias de la app en el disco y decide dónde guardar. Sin red.
import { readdir, stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

const VIDEO = /\.(mp4|mov|mkv|m4v)$/i;
const BACKUP = /^porteros-backup.*\.json$/i;
const GB = 1024 ** 3;

async function entries(dir) {
  try { return await readdir(dir, { withFileTypes: true }); } catch { return []; }
}
async function info(path, name) {
  try { const s = await stat(path); return { path, name, size: s.size, mtime: s.mtimeMs }; } catch { return null; }
}

// Primero los vídeos de partido (≥ `grande` bytes) del más reciente al más antiguo; después el resto.
export async function listVideos(dirs, { grande = GB } = {}) {
  const out = [];
  for (const d of dirs) for (const e of await entries(d)) if (e.isFile() && VIDEO.test(e.name)) {
    const i = await info(join(d, e.name), e.name);
    if (i) out.push(i);
  }
  return out.sort((a, b) => (b.size >= grande) - (a.size >= grande) || b.mtime - a.mtime);
}

export async function listBackups(dirs, depth = 3) {
  const out = [];
  const walk = async (d, level) => {
    for (const e of await entries(d)) {
      const p = join(d, e.name);
      if (e.isFile() && BACKUP.test(e.name)) { const i = await info(p, e.name); if (i) out.push(i); }
      else if (e.isDirectory() && level < depth && !e.name.startsWith('.')) await walk(p, level + 1);
    }
  };
  for (const d of dirs) await walk(d, 1);
  return out.sort((a, b) => b.mtime - a.mtime);
}

const norm = p => (process.platform === 'win32' ? resolve(p).toLowerCase() : resolve(p));

export function isAllowed(path, roots) {
  if (!path || typeof path !== 'string') return false;
  const p = norm(path);
  return roots.some(r => { const n = norm(r); return p === n || p.startsWith(n.endsWith(sep) ? n : n + sep); });
}

const plain = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Carpeta del portero (p. ej. «JONATAN MORILLA») y la de sus paradas («PARADAS JONATAN MORILLA») si existen.
export async function outputDirs({ base, portero, fallback }) {
  const dirs = (await entries(base)).filter(e => e.isDirectory()).map(e => e.name);
  if (!dirs.length && !(await info(base, ''))) return { acciones: fallback, paradas: fallback };
  const name = plain(portero), first = name.split(/\s+/)[0];
  const matches = d => { const p = plain(d); return p.includes(name) || (first.length >= 3 && p.includes(first)); };
  const acc = dirs.find(d => !plain(d).startsWith('paradas') && matches(d));
  const par = dirs.find(d => plain(d).startsWith('paradas') && matches(d));
  const acciones = join(base, acc ?? String(portero).trim().toUpperCase());
  return { acciones, paradas: par ? join(base, par) : acciones };
}
