import * as db from './db.js';

const KEYS = ['seasons', 'keepers', 'players', 'matches', 'actions'];

export const buildBackup = data => ({ app: 'porteros', version: 1, exportedAt: new Date().toISOString(), ...data });

export function validateBackup(o) {
  if (!o || typeof o !== 'object' || o.app !== 'porteros') return 'El archivo no es una copia de esta app.';
  if (o.version !== 1) return 'Versión de copia no compatible.';
  for (const k of KEYS) if (!Array.isArray(o[k])) return `Copia dañada: falta «${k}».`;
  const ids = new Set(o.matches.map(m => m.id));
  if (o.actions.some(a => !ids.has(a.matchId))) return 'Copia dañada: hay acciones sin partido.';
  return null;
}

export async function exportBackup() {
  const blob = new Blob([JSON.stringify(buildBackup(await db.dumpAll()))], { type: 'application/json' });
  download(blob, `porteros-backup-${new Date().toISOString().slice(0, 10)}.json`);
  await db.setMeta('lastBackup', Date.now());
}

// Devuelve mensaje de error o null si se importó (o el usuario canceló: 'cancel').
export async function importBackup(file) {
  let o;
  try { o = JSON.parse(await file.text()); } catch { return 'El archivo no es una copia válida (JSON ilegible).'; }
  const err = validateBackup(o);
  if (err) return err;
  if (!confirm(`Se sustituirán TODOS los datos actuales por la copia (${o.matches.length} partidos). ¿Continuar?`)) return 'cancel';
  await db.replaceAll(o);
  return null;
}

export function download(blob, name) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
