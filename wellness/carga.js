// RPE de los porteros (formulario «RPE de la sesión») + «Sesión del día» de Jorge → filas de la hoja CARGA Y READINESS.
// Funciones puras: sin red, sin disco y sin Excel.
import { normaliza, fechaMadrid, aPortero } from './mapeo.js';

const campoRpe = t => {
  const n = normaliza(t);
  if (n.includes('nombre')) return 'nombre';
  if (n.includes('comentario')) return 'comentario';
  if (n.includes('dura') || n.includes('rpe') || n.includes('esfuerzo')) return 'rpe';
  return null;
};
const campoSesion = t => {
  const n = normaliza(t);
  if (n.includes('duracion') || n.includes('minutos')) return 'duracion';
  if (n.includes('microciclo')) return 'microciclo';
  if (n.includes('tipo')) return 'tipo';
  if (n.includes('fecha')) return 'fecha';
  if (n.includes('observaciones')) return 'observaciones';
  return null;
};

function envios(payload, campoFn) {
  const preguntas = new Map((payload.questions ?? []).map(q => [q.id, campoFn(q.title)]));
  return (payload.submissions ?? []).filter(s => s.isCompleted !== false).map(s => {
    const valores = {};
    for (const r of s.responses ?? []) {
      const c = preguntas.get(r.questionId);
      if (!c) continue;
      const v = typeof r.answer === 'number' ? r.answer : r.formattedAnswer ?? r.answer;
      valores[c] = Array.isArray(v) ? v.join(', ') : v;
    }
    return { id: s.id, enviado: new Date(s.submittedAt).toISOString(), ...fechaMadrid(s.submittedAt), valores };
  });
}

const ultimoPorClave = (lista, clave) => {
  const m = new Map();
  for (const x of lista) { const k = clave(x); if (!m.has(k) || x.enviado > m.get(k).enviado) m.set(k, x); }
  return m;
};
const texto = v => String(v ?? '').trim();

export function rpeDesdeApi(payload, { porteros = [], alias = {} } = {}) {
  const avisos = [];
  const validas = [];
  for (const e of envios(payload, campoRpe)) {
    const portero = aPortero(e.valores.nombre, porteros, alias);
    const m = texto(e.valores.rpe).match(/^(\d+)/);
    const rpe = m ? Number(m[1]) : NaN;
    if (!portero) { avisos.push(`RPE ${e.fecha}: envío sin nombre`); continue; }
    if (!(rpe >= 0 && rpe <= 10)) { avisos.push(`RPE ${e.fecha} ${portero}: «${texto(e.valores.rpe)}» no es un valor de 0 a 10; no se usa`); continue; }
    validas.push({ id: e.id, enviado: e.enviado, fecha: e.fecha, portero, rpe, comentario: texto(e.valores.comentario) });
  }
  const filas = [...ultimoPorClave(validas, x => x.fecha + '|' + x.portero).values()].sort((a, b) => (a.fecha + a.portero).localeCompare(b.fecha + b.portero));
  return { filas, avisos };
}

// «24/11», «24-11-2026»… con el año del envío; si así quedaría en el futuro, es del año anterior.
export function fechaDeTexto(t, fechaEnvio) {
  const m = texto(t).match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
  if (!m) return null;
  const [d, mes] = [Number(m[1]), Number(m[2])];
  let y = m[3] ? Number(m[3].length === 2 ? '20' + m[3] : m[3]) : Number(fechaEnvio.slice(0, 4));
  const iso = (yy) => `${yy}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  if (!m[3] && iso(y) > fechaEnvio) y -= 1;
  const f = new Date(iso(y) + 'T12:00:00Z');
  return f.getUTCMonth() + 1 === mes && f.getUTCDate() === d ? iso(y) : null;
}

export function sesionesDesdeApi(payload) {
  const avisos = [];
  const lista = envios(payload, campoSesion).map(e => {
    let fecha = e.fecha;
    if (texto(e.valores.fecha)) {
      const f = fechaDeTexto(e.valores.fecha, e.fecha);
      if (f) fecha = f; else avisos.push(`Sesión enviada el ${e.fecha}: no entiendo la fecha «${texto(e.valores.fecha)}»; uso la del envío`);
    }
    const min = texto(e.valores.duracion).match(/(\d+(?:[.,]\d+)?)/);
    return { enviado: e.enviado, fecha, microciclo: texto(e.valores.microciclo), tipo: texto(e.valores.tipo), duracion: min ? Number(min[1].replace(',', '.')) : null, observaciones: texto(e.valores.observaciones) };
  });
  const sesiones = new Map([...ultimoPorClave(lista, x => x.fecha).entries()].map(([f, s]) => [f, { microciclo: s.microciclo, tipo: s.tipo, duracion: s.duracion, observaciones: s.observaciones }]));
  return { sesiones, avisos };
}

export function filasCarga(rpes, sesiones) {
  const sinSesion = new Set();
  const filas = rpes.map(r => {
    const s = sesiones.get(r.fecha);
    if (!s) sinSesion.add(r.fecha);
    return { fecha: r.fecha, portero: r.portero, microciclo: s?.microciclo || null, tipo: s?.tipo || null, duracion: s?.duracion ?? null, rpe: r.rpe,
      observaciones: [s?.observaciones, r.comentario].filter(Boolean).join(' · ') };
  });
  return { filas, sinSesion: [...sinSesion].sort() };
}
