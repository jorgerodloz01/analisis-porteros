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
    r.onsuccess = () => { navigator.storage?.persist?.(); res(r.result); };
    r.onerror = () => rej(r.error);
  }));
}

const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const store = async (name, mode = 'readonly') => (await open()).transaction(name, mode).objectStore(name);

export const all = async s => req((await store(s)).getAll());
export const get = async (s, id) => req((await store(s)).get(id));
export const put = async (s, obj) => req((await store(s, 'readwrite')).put(obj));
export const del = async (s, id) => req((await store(s, 'readwrite')).delete(id));
export const actionsOf = async matchId => req((await store('actions')).index('matchId').getAll(matchId));
export const getMeta = async key => (await get('meta', key))?.value;
export const setMeta = (key, value) => put('meta', { key, value });

export async function deleteMatch(id) {
  const tx = (await open()).transaction(['matches', 'actions'], 'readwrite');
  tx.objectStore('matches').delete(id);
  const acts = await req(tx.objectStore('actions').index('matchId').getAllKeys(id));
  acts.forEach(k => tx.objectStore('actions').delete(k));
  return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
}

// Sustituye todos los datos en una sola transacción: si algo falla, no se toca nada.
export async function replaceAll(data) {
  const names = STORES.filter(s => s !== 'meta');
  const tx = (await open()).transaction(names, 'readwrite');
  for (const s of names) {
    const st = tx.objectStore(s);
    st.clear();
    for (const o of data[s] || []) st.put(o);
  }
  return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = tx.onabort = () => rej(tx.error); });
}

export async function dumpAll() {
  const out = {};
  for (const s of STORES.filter(s => s !== 'meta')) out[s] = await all(s);
  return out;
}
