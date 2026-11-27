// Llamadas a la API de Tally (https://developers.tally.so). La función fetch se inyecta para poder probarlo sin red.
import { normaliza } from './mapeo.js';

const BASE = 'https://api.tally.so';

export async function llamarApi(clave, ruta, fetchFn = fetch) {
  let r;
  try {
    r = await fetchFn(BASE + ruta, { headers: { Authorization: 'Bearer ' + clave, Accept: 'application/json' } });
  } catch (e) {
    throw new Error(`No se pudo conectar con Tally (${e.message}). ¿Hay internet?`);
  }
  if (r.status === 401 || r.status === 403) throw new Error('La clave de Tally no es válida o no tiene acceso a este formulario. Borra la clave guardada y vuelve a ejecutar para pegar otra (instrucciones en el README).');
  if (r.status === 404) throw new Error('Tally no encuentra ese formulario. Revisa el enlace o el id.');
  if (!r.ok) throw new Error(`Tally respondió ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

// La lista de formularios puede venir como { items: [...] } o como array; el nombre como name o title.
export function elegirFormulario(lista) {
  const forms = Array.isArray(lista) ? lista : lista?.items ?? lista?.forms ?? lista?.data ?? [];
  const wellness = forms.filter(f => normaliza(f.name ?? f.title).includes('wellness'));
  return wellness.length === 1 ? wellness[0].id : null;
}

export function idDesdeEnlace(texto) {
  const s = String(texto ?? '').trim();
  const m = s.match(/tally\.so\/(?:r|forms|embed)\/([A-Za-z0-9]+)/);
  return m ? m[1] : /^[A-Za-z0-9]+$/.test(s) ? s : null;
}

export async function todasLasRespuestas(api, formId, maxPaginas = 50) {
  const preguntas = new Map();
  const envios = [];
  for (let page = 1; page <= maxPaginas; page++) {
    const r = await api(`/forms/${formId}/submissions?page=${page}&limit=500&filter=completed`);
    for (const q of r.questions ?? []) preguntas.set(q.id, q);
    envios.push(...(r.submissions ?? []));
    if (!r.hasMore) break;
  }
  return { questions: [...preguntas.values()], submissions: envios };
}
