// Página de la herramienta de vídeo. Habla solo con el servidor local (127.0.0.1).
const $ = id => document.getElementById(id);
const st = { video: null, backup: null, matches: [], clips: [], kick1: null, kick2: null, salidaBase: '', stopAt: null };

async function api(path, data) {
  const r = await fetch(path, data ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {});
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
}

export const fmt = s => {
  if (s == null || !Number.isFinite(s)) return '';
  const t = Math.max(0, Math.round(s));
  return [Math.floor(t / 3600), Math.floor(t / 60) % 60, t % 60].map(n => String(n).padStart(2, '0')).join(':');
};
export const parseTime = v => {
  const p = String(v).trim().replace(',', '.').split(':').map(Number);
  if (!p.length || p.some(n => !Number.isFinite(n) || n < 0)) return null;
  return p.reduce((acc, n) => acc * 60 + n, 0);
};
const gb = b => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)} GB` : `${Math.round(b / 1024 ** 2)} MB`);
const fecha = ms => new Date(ms).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
const opt = (value, text) => Object.assign(document.createElement('option'), { value, textContent: text });
const store = { get: k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } } };
const showError = (where, e) => { where.replaceChildren(Object.assign(document.createElement('div'), { className: 'error', textContent: e.message || String(e) })); };

function invalidate() { st.clips = []; $('tabla').hidden = true; $('resumen').textContent = ''; $('generar').disabled = true; }

// ---------- 1. Vídeo
function useVideo(path, size = 0) {
  st.video = { path, size };
  $('player').src = '/video?path=' + encodeURIComponent(path);
  const saved = store.get('kicks:' + path + '|' + size) || {};
  setKick(1, saved.k1 ?? null, false); setKick(2, saved.k2 ?? null, false);
  invalidate();
}
$('video').onchange = () => { const o = $('video').selectedOptions[0]; if (o?.value) useVideo(o.value, Number(o.dataset.size)); };
$('videoOtroOk').onclick = () => { const p = $('videoOtro').value.trim().replace(/^"|"$/g, ''); if (p) useVideo(p); };

// ---------- 2. Copia, partido y portero
async function useBackup(path) {
  st.backup = path;
  try {
    const { matches } = await api('/api/backup?path=' + encodeURIComponent(path));
    st.matches = matches;
    $('partido').replaceChildren(...matches.map(m => opt(m.id, `${new Date(m.date + 'T12:00').toLocaleDateString('es-ES')} · ${m.home ? 'vs' : '@'} ${m.rival}`)));
    if (!matches.length) $('partido').replaceChildren(opt('', 'La copia no tiene partidos'));
    fillKeepers();
  } catch (e) { $('partido').replaceChildren(opt('', 'No se pudo leer la copia')); $('portero').replaceChildren(); showError($('resultado'), e); }
  invalidate();
}
function fillKeepers() {
  const m = st.matches.find(x => x.id === $('partido').value);
  const ks = (m?.keepers || []).slice().sort((a, b) => b.acciones - a.acciones);
  $('portero').replaceChildren(...ks.map(k => opt(k.id, `${k.name} · ${k.acciones} acciones`)));
  $('nombre').value = ks[0]?.name.split(/\s+/)[0] || '';
  invalidate();
}
$('backup').onchange = () => $('backup').value && useBackup($('backup').value);
$('backupArchivo').onchange = async () => {
  const f = $('backupArchivo').files[0];
  if (!f) return;
  try {
    const { path } = await api('/api/backup-subida', { nombre: f.name, contenido: await f.text() });
    $('backup').prepend(opt(path, `${f.name} · elegida`));
    $('backup').value = path;
    $('backupNombre').textContent = '';
    await useBackup(path);
  } catch (e) { $('backupNombre').textContent = '⚠ ' + e.message; }
  $('backupArchivo').value = '';
};
$('partido').onchange = fillKeepers;
$('portero').onchange = () => { const m = st.matches.find(x => x.id === $('partido').value); $('nombre').value = m?.keepers.find(k => k.id === $('portero').value)?.name.split(/\s+/)[0] || ''; invalidate(); };

// ---------- 3. Pitidos
const player = $('player');
player.ontimeupdate = () => {
  $('pos').textContent = fmt(player.currentTime);
  if (st.stopAt != null && player.currentTime >= st.stopAt) { player.pause(); st.stopAt = null; }
};
document.querySelectorAll('[data-j]').forEach(b => { b.onclick = () => { player.currentTime = Math.max(0, player.currentTime + Number(b.dataset.j)); }; });
function setKick(n, sec, save = true) {
  st['kick' + n] = sec;
  const input = $(`k${n}v`);
  input.value = sec == null ? '' : fmt(sec);
  input.classList.toggle('set', sec != null);
  if (save && st.video) store.set('kicks:' + st.video.path + '|' + st.video.size, { k1: st.kick1, k2: st.kick2 });
  invalidate();
}
$('k1').onclick = () => setKick(1, Math.round(player.currentTime * 10) / 10);
$('k2').onclick = () => setKick(2, Math.round(player.currentTime * 10) / 10);
$('k1v').onchange = () => setKick(1, $('k1v').value.trim() ? parseTime($('k1v').value) : null);
$('k2v').onchange = () => setKick(2, $('k2v').value.trim() ? parseTime($('k2v').value) : null);

// ---------- 4. Clips
$('calcular').onclick = async () => {
  const falta = !st.video ? 'el vídeo' : !st.backup || !$('partido').value ? 'el partido' : !$('portero').value ? 'el portero' : st.kick1 == null ? 'el pitido de la 1.ª parte' : null;
  if (falta) { $('resumen').textContent = `Falta ${falta}.`; return; }
  $('resumen').textContent = 'Calculando…';
  try {
    const r = await api('/api/clips', { videoPath: st.video.path, backupPath: st.backup, matchId: $('partido').value, keeperId: $('portero').value, kick1: st.kick1, kick2: st.kick2 });
    st.clips = r.clips;
    paintClips();
    const avisos = [];
    if (r.descartadas) avisos.push(`${r.descartadas} acción(es) fuera del vídeo: revisa los pitidos${st.kick2 == null ? ' (falta el de la 2.ª parte)' : ''}`);
    if (!r.acciones) avisos.push('este portero no tiene acciones en el partido');
    $('resumen').textContent = summary() + (avisos.length ? ` · ⚠ ${avisos.join(' · ')}` : '');
  } catch (e) { $('resumen').textContent = ''; showError($('resultado'), e); }
};
const summary = () => {
  const on = st.clips.filter(c => c.include);
  const secs = on.reduce((s, c) => s + c.end - c.start, 0);
  return `${on.length} de ${st.clips.length} clips · ${on.reduce((s, c) => s + c.actions.length, 0)} acciones · ${Math.round(secs / 60 * 10) / 10} min`;
};
function paintClips() {
  const tb = $('tabla').tBodies[0];
  tb.replaceChildren(...st.clips.map(c => {
    const tr = document.createElement('tr');
    tr.className = c.include ? '' : 'off';
    const cb = Object.assign(document.createElement('input'), { type: 'checkbox', checked: c.include, onchange: () => { c.include = cb.checked; paintClips(); $('resumen').textContent = summary(); } });
    const acc = document.createElement('td'); acc.className = 'acc';
    acc.append(...c.actions.map(a => Object.assign(document.createElement('div'), { textContent: (a.parada ? '🧤 ' : '') + a.label })));
    const btn = (t, f) => Object.assign(document.createElement('button'), { className: 'btn small', textContent: t, onclick: f });
    const shift = d => { if (c.start + d < 0) d = -c.start; c.start += d; c.end += d; c.actions.forEach(a => { a.at -= d; }); paintClips(); };
    const ops = document.createElement('td'); ops.className = 'ops';
    ops.append(btn('▶ Ver', () => { player.currentTime = c.start; st.stopAt = c.end; player.play(); player.scrollIntoView({ behavior: 'smooth', block: 'center' }); }), ' ', btn('◀ 2″', () => shift(-2)), ' ', btn('2″ ▶', () => shift(2)));
    const td = (x, cls = '') => { const e = document.createElement('td'); e.className = cls; e.append(x); return e; };
    tr.append(td(cb), acc, td(fmt(c.start), 'tm'), td(fmt(c.end), 'tm'), ops);
    return tr;
  }));
  $('tabla').hidden = !st.clips.length;
  $('generar').disabled = !st.clips.some(c => c.include);
}

// ---------- 5. Generar
$('generar').onclick = async () => {
  $('generar').disabled = true;
  $('resultado').replaceChildren();
  $('progreso').hidden = false; $('barra').value = 0; $('fase').textContent = 'Empezando…';
  try {
    const { jobId } = await api('/api/generar', { videoPath: st.video.path, backupPath: st.backup, matchId: $('partido').value, keeperId: $('portero').value,
      jornada: $('jornada').value.trim(), portero: $('nombre').value.trim(), clips: st.clips, orden: $('orden').value, paradas: $('paradas').checked });
    for (;;) {
      await new Promise(r => setTimeout(r, 1000));
      const j = await api('/api/trabajo?id=' + jobId);
      $('barra').value = j.total ? j.hecho / j.total : 0; $('fase').textContent = j.fase;
      if (j.error) throw new Error(j.error);
      if (j.salidas) { done(j.salidas); break; }
    }
  } catch (e) { showError($('resultado'), e); }
  $('generar').disabled = false;
};
function done(s) {
  const box = Object.assign(document.createElement('div'), { className: 'ok' });
  const line = (label, path) => {
    const d = document.createElement('div');
    d.append(`${label}: ${path} `, Object.assign(document.createElement('button'), { className: 'btn small', textContent: 'Abrir carpeta', onclick: () => api('/api/abrir', { path }).catch(e => showError($('resultado'), e)) }));
    return d;
  };
  box.append(Object.assign(document.createElement('strong'), { textContent: `✅ Listo · ${s.clips} clips` }), line('Acciones', s.acciones));
  if (s.paradas) box.append(line(`Paradas (${s.paradasClips} clips)`, s.paradas));
  else if ($('paradas').checked) box.append(Object.assign(document.createElement('div'), { className: 'muted', textContent: 'No hay paradas en los clips marcados: no se ha creado vídeo de paradas.' }));
  $('resultado').replaceChildren(box);
}

// ---------- Inicio
(async () => {
  try {
    const s = await api('/api/estado-inicial');
    st.salidaBase = s.salidaBase;
    $('destino').textContent = `Se guarda en: ${s.salidaBase} (carpeta del portero si existe). El vídeo original no se toca.`;
    if (!s.ffmpeg) {
      const a = $('aviso'); a.hidden = false;
      a.innerHTML = 'No encuentro <b>ffmpeg</b>, que hace falta para cortar el vídeo. Abre PowerShell, ejecuta <code>winget install --id Gyan.FFmpeg -e</code>, cierra esta ventana y la negra, y vuelve a abrir la herramienta.';
    }
    $('video').replaceChildren(...(s.videos.length ? s.videos.map(v => opt(v.path, `${v.name} · ${gb(v.size)} · ${fecha(v.mtime)}`))
      : [opt('', 'No hay vídeos en Descargas: usa «Usar otro archivo»')]));
    s.videos.forEach((v, i) => { $('video').options[i].dataset.size = v.size; });
    if (s.videos[0]) useVideo(s.videos[0].path, s.videos[0].size);
    $('backup').replaceChildren(...(s.backups.length ? s.backups.map(b => opt(b.path, `${b.name} · ${fecha(b.mtime)}`)) : [opt('', 'No encuentro copias en iCloud Drive ni Descargas')]));
    if (s.backups[0]) await useBackup(s.backups[0].path);
  } catch (e) { showError($('resultado'), e); }
})();
