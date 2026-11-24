// IndexedDB: un store por entidad. La conexión se abre al primer uso.
export const STORES = ['seasons', 'keepers', 'players', 'matches', 'actions', 'meta'];
let dbp;

export function open() {
  return (dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open('porteros', 1);
    r.onupgradeneeded = () => {
      for (const s of STORES) {
        const st = r.result.createObjectStore(s, { keyPath: s === 'meta' ? 'key' : 'id' });
        if (s === 'actions') st.createIndex('matchId', 'matchId');
      }
    };
    r.onsuccess = () => {
      const db = r.result;
      // iOS puede cortar la conexión al volver de segundo plano: la próxima operación reabre.
      db.onclose = db.onversionchange = () => { db.close(); dbp = null; };
      navigator.storage?.persist?.();
      res(db);
    };
    r.onerror = () => { dbp = null; rej(r.error); };
  }));
}

async function tx(names, mode) {
  try { return (await open()).transaction(names, mode); }
  catch (e) { if (e.name !== 'InvalidStateError') throw e; dbp = null; return (await open()).transaction(names, mode); }
}

const done = t => new Promise((res, rej) => { t.oncomplete = res; t.onerror = t.onabort = () => rej(t.error || new Error('Transacción abortada')); });
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const store = async (name, mode = 'readonly') => (await tx(name, mode)).objectStore(name);

export const all = async s => req((await store(s)).getAll());
export const get = async (s, id) => req((await store(s)).get(id));
export const put = async (s, obj) => req((await store(s, 'readwrite')).put(obj));
export const del = async (s, id) => req((await store(s, 'readwrite')).delete(id));
export const actionsOf = async matchId => req((await store('actions')).index('matchId').getAll(matchId));
export const getMeta = async key => (await get('meta', key))?.value;
export const setMeta = (key, value) => put('meta', { key, value });

export async function deleteMatch(id) {
  const t = await tx(['matches', 'actions'], 'readwrite');
  t.objectStore('matches').delete(id);
  const acts = await req(t.objectStore('actions').index('matchId').getAllKeys(id));
  acts.forEach(k => t.objectStore('actions').delete(k));
  return done(t);
}

// Sustituye todos los datos en una sola transacción: si algo falla, no se toca nada.
export async function replaceAll(data) {
  const names = STORES.filter(s => s !== 'meta');
  const t = await tx(names, 'readwrite');
  const finished = done(t);
  try {
    for (const s of names) {
      const st = t.objectStore(s);
      st.clear();
      for (const o of data[s] || []) st.put(o);
    }
  } catch (e) { t.abort(); finished.catch(() => {}); throw e; } // un put síncrono que lanza no aborta solo
  return finished;
}

export async function dumpAll() {
  const out = {};
  for (const s of STORES.filter(s => s !== 'meta')) out[s] = await all(s);
  return out;
}
