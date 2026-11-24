import * as db from '../db.js';
import { h, uid } from './dom.js';
import { TABS, TYPES, visibleSteps, stepValue, missingRequired, cleanAction } from '../catalog.js';
import { clockSeconds, minuteLabel, parseMinute } from '../logic.js';
import { pitchSVG, goalSVG, drawMarkers } from './pitch.js';
import { avatar } from './setup.js';
import { exportBackup } from '../backup.js';

const fmtClock = sec => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
const POINT_COLORS = ['#facc15', '#38bdf8', '#f472b6'];
const isGoal = a => (a.type === 'tiro' || a.type === 'penalti') && a.attrs.resultado === 'gol';

export async function renderRegister(el, matchId) {
  const match = await db.get('matches', matchId);
  if (!match) { el.append(h('p.error', 'Partido no encontrado.')); return; }
  const allKeepers = await db.all('keepers');
  const keepers = match.keepers.map(k => allKeepers.find(x => x.id === k.keeperId)).filter(Boolean);
  const players = (await db.all('players')).filter(p => match.lineup?.includes(p.id)).sort((a, b) => a.number - b.number);
  const st = {
    actions: await db.actionsOf(matchId),
    tab: 'defensa',
    keeperId: keepers[0]?.id,
    draft: null,   // acción en curso
    step: 0,
  };

  const fail = (what, e) => alert(`No se pudo ${what}. Lo ya guardado no se pierde; si se repite, cierra y vuelve a abrir la app.\n(${e.message})`);
  const saveMatch = () => db.put('matches', match).catch(e => fail('guardar el reloj/marcador', e));
  const now = () => clockSeconds(match.clock, Date.now());

  // ---------- Cabecera
  const clockEl = h('span.clock', { 'aria-live': 'off' });
  const startBtn = h('button.btn.primary', { onclick: () => toggleClock() });
  const halfBtns = [1, 2].map(n => h('button.btn.small', { onclick: () => setHalf(n) }, n === 1 ? '1.ª parte' : '2.ª parte'));
  const scoreEl = h('span.score');
  const adj = (label, d) => h('button.btn.small', { onclick: () => { match.clock.accumulated += Math.max(d, -now()); saveMatch(); tick(); } }, label);
  const goalBtn = (key, label, d) => h('button.btn.small', { 'aria-label': label, onclick: () => { match[key] = Math.max(0, match[key] + d); saveMatch(); paintHead(); } }, d > 0 ? '+' : '−');

  function paintHead() {
    scoreEl.textContent = `${match.goalsFor} - ${match.goalsAgainst}`;
    startBtn.textContent = match.clock.running ? '⏸ Pausa' : '▶ Iniciar';
    halfBtns.forEach((b, i) => b.classList.toggle('on', match.clock.half === i + 1));
  }
  function tick() { clockEl.textContent = fmtClock(now()); }
  function toggleClock() {
    const c = match.clock;
    if (c.running) { c.accumulated = now(); c.running = false; c.startedAt = null; }
    else { c.running = true; c.startedAt = Date.now(); }
    saveMatch(); paintHead(); tick();
  }
  function setHalf(n) {
    const c = match.clock;
    if (c.half === n) return;
    if (now() > 0 && !confirm(`¿Pasar a la ${n === 1 ? '1.ª' : '2.ª'} parte? El cronómetro vuelve a 00:00.`)) return;
    Object.assign(c, { half: n, running: false, startedAt: null, accumulated: 0 });
    saveMatch(); paintHead(); tick();
  }
  const timer = setInterval(() => { if (!clockEl.isConnected) clearInterval(timer); else tick(); }, 250);

  const head = h('div.reg-head',
    h('a.btn.small', { href: '#/' }, '← Partidos'),
    h('strong', `${match.home ? 'vs' : '@'} ${match.rival}`),
    h('span.scorebox', goalBtn('goalsFor', 'Restar gol a favor', -1), goalBtn('goalsFor', 'Gol a favor', 1), scoreEl, goalBtn('goalsAgainst', 'Restar gol en contra', -1), goalBtn('goalsAgainst', 'Gol en contra', 1)),
    h('span', { style: 'flex:1' }),
    halfBtns, clockEl, startBtn,
    h('span.adj', adj('−1′', -60), adj('−10″', -10), adj('+10″', 10), adj('+1′', 60)),
    h('button.btn.small', { onclick: finish }, 'Finalizar'),
    h('a.btn.small', { href: `#/match/${matchId}/report` }, 'Informe'));

  async function finish() {
    if (match.clock.running) toggleClock();
    match.finished = true; await saveMatch();
    if (confirm('Partido finalizado. Los datos solo están en este iPad. ¿Exportar ahora una copia de seguridad?')) await exportBackup();
    location.hash = `#/match/${matchId}/report`;
  }

  // ---------- Cuerpo
  const tabsEl = h('div.reg-tabs');
  const typesEl = h('div.types');
  const stageTitle = h('div.stage-title');
  const stageMain = h('div.stage-main');
  const keeperEl = h('div.keeper-pick');
  const logEl = h('ul.list.log');
  const stepsEl = h('div.steps');

  function paintTabs() {
    tabsEl.replaceChildren(...TABS.map(t => h('button' + (t.key === st.tab ? '.on' : ''), { onclick: () => { st.tab = t.key; paintTabs(); } }, h('strong', t.label), h('small', t.sub))));
    typesEl.replaceChildren(...TABS.find(t => t.key === st.tab).types.map(k =>
      h('button' + (st.draft?.type === k ? '.on' : ''), { onclick: () => discardOk() && newDraft(k) }, TYPES[k].label)));
  }

  function paintKeepers() {
    keeperEl.replaceChildren(...keepers.map(k => h('button' + (k.id === (st.draft?.keeperId ?? st.keeperId) ? '.on' : ''), {
      onclick: () => { st.keeperId = k.id; if (st.draft) st.draft.keeperId = k.id; paintKeepers(); },
    }, avatar(k), k.name)));
  }

  function newDraft(type, attrs = {}) {
    st.draft = { id: null, matchId, keeperId: st.keeperId, half: match.clock.half, t: Math.floor(now()), type, points: {}, attrs, note: '' };
    st.step = 0;
    paintAll();
  }

  const steps = () => (st.draft ? visibleSteps(st.draft.type, st.draft) : []);
  function advance() {
    const list = steps();
    st.step = Math.min(st.step + 1, list.length - 1);
    paintAll();
  }

  function paintStage() {
    const d = st.draft;
    if (!d) {
      stageTitle.replaceChildren(h('span', 'Elige una acción'));
      stageMain.replaceChildren(h('div.empty-stage', h('p', 'Selecciona a la izquierda qué acción quieres registrar.'), h('p', 'El minuto se toma del cronómetro al elegir la acción.')));
      return;
    }
    const list = steps();
    const step = list[st.step];
    stageTitle.replaceChildren(h('span', `${TYPES[d.type].label} · ${st.step + 1}. ${step.label}${step.required ? ' ★' : ''}`),
      h('span.muted', d.id ? 'Editando · ' : '', minuteLabel(d.half, d.t), ' ', d.half === 1 ? '(1.ª)' : '(2.ª)'));
    if (step.kind === 'pitch') {
      const pitchSteps = list.filter(s => s.kind === 'pitch');
      const svg = pitchSVG({ onTap: p => { d.points[step.key] = p; advance(); } });
      const marks = pitchSteps.map((s, i) => d.points[s.key] && { p: d.points[s.key], color: POINT_COLORS[i % 3], label: String(i + 1) }).filter(Boolean);
      const o = d.points.origen, dest = d.points.destino;
      if (o && dest) marks.unshift({ p: o, to: dest, color: '#fff', r: .01 });
      stageMain.replaceChildren(drawMarkers(svg, marks));
    } else if (step.kind === 'goal') {
      stageMain.replaceChildren(h('div', { style: 'width:100%;text-align:center' },
        goalSVG({ highlight: d.points[step.key], onTap: c => { d.points[step.key] = c; advance(); } }),
        h('p.muted', 'Portería vista desde el campo (izquierda/derecha según la imagen).')));
    } else if (step.kind === 'choice') {
      stageMain.replaceChildren(h('div.options', step.options.map(o => h('button' + (d.attrs[step.key] === o.value ? '.on' : ''), {
        onclick: () => { if (d.attrs[step.key] === o.value) delete d.attrs[step.key]; else d.attrs[step.key] = o.value; advance(); },
      }, o.label))));
    } else if (step.kind === 'receptor') {
      const other = h('input', { type: 'number', placeholder: 'Otro dorsal', style: 'width:140px', inputMode: 'numeric' });
      stageMain.replaceChildren(h('div', { style: 'width:100%' },
        h('div.options', players.map(p => h('button' + (d.attrs.receptor === String(p.number) ? '.on' : ''), { onclick: () => { d.attrs.receptor = String(p.number); advance(); } }, `#${p.number} ${p.name}`))),
        h('form.row', { style: 'margin-top:12px', onsubmit: e => { e.preventDefault(); if (other.value) { d.attrs.receptor = other.value; advance(); } } }, other, h('button.btn', 'OK'),
          players.length ? null : h('span.muted', 'Sin once definido: introduce el dorsal.'))));
    }
  }

  function paintSteps() {
    const d = st.draft;
    if (!d) { stepsEl.replaceChildren(h('span.muted', 'Pulsa una acción para empezar.')); return; }
    const missing = missingRequired(d.type, d);
    const saveBtn = h('button.btn.primary', { disabled: missing.length > 0, onclick: save, title: missing.length ? 'Faltan pasos ★' : '' }, d.id ? 'Guardar cambios' : 'Guardar');
    stepsEl.replaceChildren(h('div.steps-list',
      ...steps().map((s, i) => h(`button${i === st.step ? '.cur' : ''}${stepValue(s, d) != null ? '.done' : ''}${s.required ? '.req' : ''}`,
        { onclick: () => { st.step = i; paintAll(); } }, `${i + 1}. ${s.label}`))),
      h('div.steps-actions',
      h('button', { onclick: editTime }, '⏱ ', minuteLabel(d.half, d.t)),
      h('button', { onclick: () => { const n = prompt('Nota de la acción', d.note || ''); if (n != null) { d.note = n.trim(); paintSteps(); } } }, d.note ? '📝 Nota ✓' : '📝 Nota'),
      h('button', { onclick: () => { st.draft = null; paintAll(); } }, 'Cancelar'),
      saveBtn));
    stepsEl.querySelector('.cur')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function editTime() {
    const d = st.draft;
    let v = prompt('Minuto de partido (ej. 12, 45+2, 67, 90+3)', minuteLabel(d.half, d.t).replace("'", ''));
    while (v != null) {
      const p = parseMinute(v);
      if (p) { Object.assign(d, p); paintAll(); return; }
      v = prompt('Minuto no válido. Usa 1-45, 45+N, 46-90 o 90+N:', v);
    }
  }

  async function save() {
    const d = st.draft;
    const isNew = !d.id;
    const prev = isNew ? null : st.actions.find(a => a.id === d.id);
    const action = cleanAction({ ...d, id: d.id || uid(), createdAt: prev?.createdAt || Date.now() });
    try { await db.put('actions', action); } catch (e) { fail('guardar la acción (sigue en pantalla, pulsa Guardar otra vez)', e); return; }
    st.actions = st.actions.filter(a => a.id !== action.id).concat(action);
    // marcador: goles en contra siguen a las acciones de gol
    const delta = (isGoal(action) ? 1 : 0) - (prev && isGoal(prev) ? 1 : 0);
    if (delta) { match.goalsAgainst = Math.max(0, match.goalsAgainst + delta); await saveMatch(); }
    st.draft = null;
    const follow = action.type === 'abp_def' && ['tiro', 'centro'].includes(action.attrs.intervencion) ? action.attrs.intervencion : null;
    if (follow && isNew) { st.tab = 'defensa'; newDraft(follow, follow === 'tiro' ? { contexto: 'abp' } : { desde_abp: 'si' }); st.draft.half = action.half; st.draft.t = action.t; }
    paintAll();
  }

  async function remove(a) {
    if (!confirm(`¿Borrar ${TYPES[a.type].label} (${minuteLabel(a.half, a.t)})?`)) return;
    try { await db.del('actions', a.id); } catch (e) { fail('borrar la acción', e); return; }
    st.actions = st.actions.filter(x => x.id !== a.id);
    if (isGoal(a)) { match.goalsAgainst = Math.max(0, match.goalsAgainst - 1); await saveMatch(); }
    if (st.draft?.id === a.id) st.draft = null;
    paintAll();
  }

  function paintLog() {
    const res = a => {
      const step = TYPES[a.type].steps.find(s => s.key === 'resultado' || s.key === 'intervencion' || s.key === 'participacion');
      return step?.options.find(o => o.value === a.attrs[step.key])?.label || '';
    };
    const kName = id => keepers.find(k => k.id === id)?.name.split(' ')[0] || '';
    const sorted = [...st.actions].sort((a, b) => b.half - a.half || b.t - a.t || b.createdAt - a.createdAt);
    logEl.replaceChildren(...sorted.map(a => h('li' + (st.draft?.id === a.id ? '.editing' : ''), {
      onclick: e => { if (e.target.closest('button') || !discardOk()) return; st.draft = structuredClone(a); st.step = 0; st.tab = TABS.find(t => t.types.includes(a.type)).key; paintAll(); },
    }, h('span', h('b', minuteLabel(a.half, a.t)), ' ', TYPES[a.type].label, ' · ', res(a), keepers.length > 1 ? h('span.muted', ` · ${kName(a.keeperId)}`) : null, a.note ? ' 📝' : ''),
      h('button.btn.small.danger', { 'aria-label': 'Borrar acción', onclick: () => remove(a) }, '✕'))));
    countEl.textContent = `Registro · ${st.actions.length}`;
    undoBtn.disabled = !st.actions.length;
  }
  const countEl = h('h2');
  const undoBtn = h('button.btn.small', { onclick: () => {
    const last = st.actions.reduce((a, b) => (!a || b.createdAt > a.createdAt ? b : a), null);
    if (last) remove(last);
  } }, '↶ Deshacer última');
  // Hay algo sin guardar: acción nueva con datos, o edición distinta de lo guardado.
  function discardOk() {
    const d = st.draft;
    if (!d) return true;
    const dirty = d.id ? JSON.stringify(d) !== JSON.stringify(st.actions.find(a => a.id === d.id))
      : Object.keys(d.points).length + Object.keys(d.attrs).length > 0;
    return !dirty || confirm('Hay una acción sin guardar. ¿Descartarla?');
  }

  function paintAll() { paintHead(); paintTabs(); paintKeepers(); paintStage(); paintSteps(); paintLog(); }

  el.append(h('div.reg', head, tabsEl,
    h('div.reg-body', typesEl,
      h('div.stage', stageTitle, stageMain),
      h('div.side', h('div.card', h('h2', 'Portero'), keeperEl), h('div.card.log-card', { style: 'flex:1;display:flex;flex-direction:column;min-height:0' }, h('div.row', { style: 'justify-content:space-between' }, countEl, undoBtn), logEl))),
    stepsEl));
  paintAll(); tick();
}
