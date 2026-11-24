import * as db from './db.js';

const KEYS = ['seasons', 'keepers', 'players', 'matches', 'actions'];

export const buildBackup = data => ({ app: 'porteros', version: 1, exportedAt: new Date().toISOString(), ...data });

export function validateBackup(o) {
  if (!o || typeof o !== 'object' || o.app !== 'porteros') return 'El archivo no es una copia de esta app.';
  if (o.version !== 1) return 'Versión de copia no compatible.';
  for (const k of KEYS) {
    if (!Array.isArray(o[k])) return `Copia dañada: falta «${k}».`;
    if (o[k].some(r => !r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id)) return `Copia dañada: hay registros sin identificador en «${k}».`;
  }
  if (o.matches.some(m => typeof m.date !== 'string' || !Array.isArray(m.keepers) || !m.clock || typeof m.clock !== 'object')) return 'Copia dañada: hay partidos incompletos.';
  const ids = new Set(o.matches.map(m => m.id));
  if (o.actions.some(a => !ids.has(a.matchId) || typeof a.type !== 'string' || ![1, 2].includes(a.half) || typeof a.t !== 'number' || !a.points || !a.attrs))
    return 'Copia dañada: hay acciones incompletas o sin partido.';
  return null;
}

// En iPad se usa «Compartir» (Guardar en Archivos / iCloud): así sabemos si la copia se guardó de verdad.
export async function exportBackup() {
  const name = `porteros-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([JSON.stringify(buildBackup(await db.dumpAll()))], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Copia Análisis Porteros' }); }
    catch (e) { if (e.name !== 'AbortError') alert('No se pudo compartir la copia: ' + e.message); return false; }
  } else download(file, name); // shortcut: sin «Compartir» no sabemos si el usuario guardó la descarga
  await db.setMeta('lastBackup', Date.now());
  return true;
}

// Devuelve mensaje de error o null si se importó (o el usuario canceló: 'cancel').
export async function importBackup(file) {
  let o;
  try { o = JSON.parse(await file.text()); } catch { return 'El archivo no es una copia válida (JSON ilegible).'; }
  const err = validateBackup(o);
  if (err) return err;
  if (!confirm(`Se sustituirán TODOS los datos actuales por la copia (${o.matches.length} partidos). ¿Continuar?`)) return 'cancel';
  try { await db.replaceAll(o); } catch (e) { return 'No se pudo importar (tus datos no se han tocado): ' + e.message; }
  return null;
}

export function download(blob, name) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
