// Respuestas del formulario de wellness de Tally → filas de la hoja WELLNESS del Excel de monitorización.
// Funciones puras: sin red, sin disco y sin Excel.

export const normaliza = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// Escalas 1-5 del Excel (1 = mejor estado, 5 = peor). El nombre es el de la columna del Excel, para los avisos.
const ESCALAS = { sueno: 'Calidad del sueño', fatigaFisica: 'Fatiga física', fatigaMental: 'Fatiga mental', estres: 'Estrés', dolor: 'Dolor muscular', tiesura: 'Tiesura general' };

// Qué dato es cada pregunta, por su título (así no depende de los identificadores internos de Tally).
export function campo(titulo) {
  const t = normaliza(titulo);
  if (t.startsWith('en caso de tener alguna molestia')) {
    if (t.includes('sed muy precisos')) return 'molTexto';
    return /\)\s*$/.test(t) ? 'zona' : 'molZonas';
  }
  if (t.includes('nombre')) return 'nombre';
  if (t.includes('horas')) return 'horas';
  if (t.includes('sueno')) return 'sueno';
  if (t.includes('fatiga fisica')) return 'fatigaFisica';
  if (t.includes('fatiga mental')) return 'fatigaMental';
  if (t.includes('estres')) return 'estres';
  if (t.includes('dolor')) return 'dolor';
  if (t.includes('tiesura')) return 'tiesura';
  return null;
}

// Tally da la hora en UTC. El día del wellness es el de Madrid.
export function fechaMadrid(enviado) {
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(enviado) ? enviado.replace(' ', 'T') + 'Z' : enviado;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso)).map(p => [p.type, p.value]));
  return { fecha: `${parts.year}-${parts.month}-${parts.day}`, hora: `${parts.hour}:${parts.minute}` };
}

// Las opciones del formulario son franjas («5 - 6 horas», «Menos de 5», «+ 8»): se apunta el centro de la franja.
export function horasSueno(v) {
  if (typeof v === 'number') return v;
  const t = normaliza(v).replace(',', '.');
  let m;
  if ((m = t.match(/menos de\s*(\d+(?:\.\d+)?)/))) return Number(m[1]) - 0.5;
  if ((m = t.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/))) return (Number(m[1]) + Number(m[2])) / 2;
  if ((m = t.match(/\+\s*(\d+(?:\.\d+)?)/))) return Number(m[1]) + 0.5;
  m = t.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

const ALIAS = { jona: 'Jonatan Morilla', jonatan: 'Jonatan Morilla', morilla: 'Jonatan Morilla', uri: 'Oriol Dalmau', oriol: 'Oriol Dalmau', dalmau: 'Oriol Dalmau' };

export function aPortero(nombre, porteros = [], alias = {}) {
  const n = normaliza(nombre);
  const exacto = porteros.find(p => normaliza(p) === n);
  if (exacto) return exacto;
  const tabla = { ...ALIAS, ...Object.fromEntries(Object.entries(alias).map(([k, v]) => [normaliza(k), v])) };
  if (tabla[n]) return tabla[n];
  const porNombre = porteros.filter(p => normaliza(p).split(' ')[0] === n);
  if (porNombre.length === 1) return porNombre[0];
  return String(nombre ?? '').replace(/\s+/g, ' ').trim();
}

const SIN_MOLESTIA = /^(nada|no|ninguna|ninguno|sin dolor|-|\.)?$/i;

function fila({ id, enviado, valores, zonas }, { porteros = [], alias = {}, dolorMax = 5 }) {
  const avisos = [];
  const { fecha, hora } = fechaMadrid(enviado);
  const portero = aPortero(valores.nombre, porteros, alias);
  const quien = `${fecha} ${portero}`;
  if (porteros.length && !porteros.includes(portero)) avisos.push(`«${portero}» no está en la lista de porteros del Excel (CONFIG): sus filas entran igual`);
  const out = { id, enviado: new Date(/Z|[+-]\d\d:?\d\d$/.test(enviado) ? enviado : enviado.replace(' ', 'T') + 'Z').toISOString(), fecha, hora, portero, horas: horasSueno(valores.horas) };
  const obs = [];
  for (const [k, nombre] of Object.entries(ESCALAS)) {
    const max = k === 'dolor' ? dolorMax : 5;
    const raw = valores[k];
    const num = String(raw ?? '').match(/^\s*(\d+(?:[.,]\d+)?)/); // «3», 3 o «3 estrellas»
    const v = raw === undefined || raw === null || raw === '' ? null : num ? Number(num[1].replace(',', '.')) : NaN;
    if (v === null) { out[k] = null; continue; }
    if (!Number.isInteger(v) || v < 1 || v > max) { out[k] = null; avisos.push(`${quien}: ${nombre} = ${raw} fuera de 1-${max}; celda vacía`); continue; }
    if (k === 'dolor' && max === 10) { out[k] = Math.ceil(v / 2); obs.push(`Dolor ${v}/10 → ${out[k]}/5`); } else out[k] = v;
  }
  const zonasReales = (zonas ?? []).map(z => z.trim()).filter(z => z && !SIN_MOLESTIA.test(z));
  if (zonasReales.length) obs.push(`Molestias: ${zonasReales.join(', ')}`);
  const texto = String(valores.molTexto ?? '').trim();
  if (!SIN_MOLESTIA.test(texto)) obs.push(texto);
  out.observaciones = obs.join(' · ');
  return { fila: out, avisos };
}

function juntar(envios, ctx) {
  const filas = [];
  const avisos = [];
  for (const e of envios) {
    if (!String(e.valores.nombre ?? '').trim()) { avisos.push(`Envío ${e.id} sin nombre: no se puede saber de quién es`); continue; }
    const r = fila(e, ctx);
    filas.push(r.fila);
    for (const a of r.avisos) if (!avisos.includes(a)) avisos.push(a);
  }
  return { filas, avisos };
}

// payload: { questions, submissions } de GET /forms/{id}/submissions (todas las páginas juntas).
export function desdeApi(payload, opts = {}) {
  const preguntas = new Map((payload.questions ?? []).map(q => [q.id, { campo: campo(q.title), titulo: q.title }]));
  const dolor = [...preguntas.values()].find(p => p.campo === 'dolor');
  const dolorMax = dolor && /\b10\b/.test(dolor.titulo) ? 10 : 5;
  const envios = (payload.submissions ?? []).filter(s => s.isCompleted !== false).map(s => {
    const valores = {};
    let zonas = [];
    for (const r of s.responses ?? []) {
      const c = preguntas.get(r.questionId)?.campo;
      if (!c) continue;
      const v = typeof r.answer === 'number' ? r.answer : r.formattedAnswer ?? r.answer; // escalas: el número; opciones: el texto
      if (c === 'molZonas') zonas = Array.isArray(r.answer) && r.answer.every(x => typeof x === 'string') && !r.formattedAnswer ? r.answer : String(v ?? '').split(',');
      else valores[c] = Array.isArray(v) ? v.join(', ') : v;
    }
    return { id: s.id, enviado: s.submittedAt, valores, zonas };
  });
  return juntar(envios, { ...opts, dolorMax });
}

export function parseCsv(texto) {
  const filas = [];
  let fila = [], campoActual = '', comillas = false;
  const s = texto.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (comillas) {
      if (c === '"' && s[i + 1] === '"') { campoActual += '"'; i++; } else if (c === '"') comillas = false; else campoActual += c;
    } else if (c === '"') comillas = true;
    else if (c === ',') { fila.push(campoActual); campoActual = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      fila.push(campoActual); filas.push(fila); fila = []; campoActual = '';
    } else campoActual += c;
  }
  if (campoActual !== '' || fila.length) { fila.push(campoActual); filas.push(fila); }
  return filas.filter(f => f.some(v => v !== ''));
}

// Export «Download CSV» de las respuestas de Tally.
export function desdeCsv(texto, opts = {}) {
  const [cab, ...datos] = parseCsv(texto);
  const iId = cab.indexOf('Submission ID');
  const iEnviado = cab.indexOf('Submitted at');
  const cols = cab.map(t => ({ campo: campo(t), titulo: t }));
  const dolor = cols.find(c => c.campo === 'dolor');
  const dolorMax = dolor && /\b10\b/.test(dolor.titulo) ? 10 : 5;
  const hayZonasSueltas = cols.some(c => c.campo === 'zona');
  const envios = datos.map(r => {
    const valores = {};
    const zonas = [];
    cols.forEach((c, i) => {
      if (!c.campo) return;
      if (c.campo === 'zona') { if (r[i] === 'true') zonas.push(c.titulo.match(/\(([^)]*)\)\s*$/)[1]); } else if (c.campo === 'molZonas') { if (!hayZonasSueltas) zonas.push(...String(r[i] ?? '').split(',')); } else valores[c.campo] = r[i];
    });
    return { id: r[iId], enviado: r[iEnviado], valores, zonas };
  });
  return juntar(envios, { ...opts, dolorMax });
}

// Un wellness por portero y día: si alguien envía dos veces, vale el último (si no, el Excel sumaría los dos).
export function deduplicar(filas) {
  const porDia = new Map();
  const descartados = [];
  for (const f of filas) {
    const k = f.fecha + '|' + f.portero;
    const prev = porDia.get(k);
    if (!prev) porDia.set(k, f);
    else if (f.enviado > prev.enviado) { descartados.push(prev.id); porDia.set(k, f); } else descartados.push(f.id);
  }
  const lista = [...porDia.values()].sort((a, b) => (a.fecha + a.portero).localeCompare(b.fecha + b.portero));
  return { filas: lista, descartados };
}
