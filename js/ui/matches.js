import * as db from '../db.js';
import { h, uid } from './dom.js';
import { activeSeasonId } from '../app.js';
import { avatar } from './setup.js';

export async function renderMatches(el) {
  const seasonId = await activeSeasonId();
  const [season, matches, keepers] = await Promise.all([db.get('seasons', seasonId), db.all('matches'), db.all('keepers')]);
  const list = matches.filter(m => m.seasonId === seasonId).sort((a, b) => b.date.localeCompare(a.date));
  const kname = id => keepers.find(k => k.id === id)?.name || '¿?';
  const page = h('div.page',
    h('div.row', h('h1', `Partidos · ${season.name}`), h('span', { style: 'flex:1' }), h('button.btn.primary', { onclick: () => showForm() }, '+ Nuevo partido')),
    h('div.form-slot'),
    h('section.card', list.length ? list.map(m => h('div.match-row',
      h('span.muted', new Date(m.date + 'T12:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })),
      h('div', h('strong', `${m.home ? 'vs' : '@'} ${m.rival}`), ' ', h('span.score', `${m.goalsFor} - ${m.goalsAgainst}`),
        h('div.muted', [m.competition, m.keepers.map(k => kname(k.keeperId)).join(', '), m.finished ? null : 'en curso'].filter(Boolean).join(' · '))),
      h('div.row',
        h('a.btn.small', { href: `#/match/${m.id}/register` }, 'Registrar'),
        h('a.btn.small', { href: `#/match/${m.id}/report` }, 'Informe'),
        h('button.btn.small', { onclick: () => showForm(m) }, 'Editar'),
        h('button.btn.small.danger', { 'aria-label': 'Borrar partido', onclick: async () => {
          if (confirm(`¿Borrar el partido contra ${m.rival} y todas sus acciones? No se puede deshacer.`)) { await db.deleteMatch(m.id); el.replaceChildren(); renderMatches(el); }
        } }, '✕')),
    )) : h('p.muted', 'Aún no hay partidos en esta temporada. Crea el primero con «Nuevo partido».')));
  el.append(page);

  async function showForm(m) {
    const [players] = await Promise.all([db.all('players')]);
    const comps = [...new Set(matches.map(x => x.competition).filter(Boolean))];
    const active = keepers.filter(k => k.active || m?.keepers.some(x => x.keeperId === k.id));
    if (!active.length) { alert('Primero añade al menos un portero en Configuración.'); location.hash = '#/setup'; return; }
    const f = Object.fromEntries(['date', 'rival', 'competition'].map(n => [n, h('input', { name: n, required: n !== 'competition' })]));
    f.date.type = 'date'; f.date.value = m?.date || new Date().toISOString().slice(0, 10);
    f.rival.value = m?.rival || ''; f.competition.value = m?.competition || comps[0] || '';
    f.competition.setAttribute('list', 'comps');
    const home = h('select', { name: 'home' }, h('option', { value: '1' }, 'Local'), h('option', { value: '0' }, 'Visitante'));
    home.value = m && !m.home ? '0' : '1';
    const kRows = active.map((k, i) => {
      const cur = m?.keepers.find(x => x.keeperId === k.id);
      const chk = h('input', { type: 'checkbox', checked: m ? !!cur : i === 0 });
      const min = h('input', { type: 'number', min: 0, max: 130, value: cur?.minutes ?? 90, style: 'width:80px', 'aria-label': `Minutos de ${k.name}` });
      return { k, chk, min, el: h('label.row', chk, avatar(k), k.name, min, h('span.muted', 'min')) };
    });
    const lineup = new Set(m?.lineup || []);
    const chips = h('div.chips', players.sort((a, b) => a.number - b.number).map(p => h('button.btn.small' + (lineup.has(p.id) ? '.on' : ''), { type: 'button', onclick: e => {
      lineup.has(p.id) ? lineup.delete(p.id) : lineup.add(p.id); e.currentTarget.classList.toggle('on');
    } }, `#${p.number} ${p.name}`)));
    const form = h('form.card', { onsubmit: async e => {
      e.preventDefault();
      const ks = kRows.filter(r => r.chk.checked).map(r => ({ keeperId: r.k.id, minutes: Number(r.min.value) || 0 }));
      if (!ks.length) return alert('Selecciona al menos un portero.');
      const data = { ...(m || { id: uid(), seasonId, goalsFor: 0, goalsAgainst: 0, clock: { half: 1, running: false, startedAt: null, accumulated: 0 }, finished: false }),
        date: f.date.value, rival: f.rival.value.trim(), competition: f.competition.value.trim(), home: home.value === '1', keepers: ks, lineup: [...lineup] };
      await db.put('matches', data);
      location.hash = m ? '#/' : `#/match/${data.id}/register`;
      if (m) { el.replaceChildren(); renderMatches(el); }
    } },
      h('h2', m ? 'Editar partido' : 'Nuevo partido'),
      h('div.form-grid', h('label', 'Fecha', f.date), h('label', 'Rival', f.rival), h('label', 'Condición', home), h('label', 'Competición', f.competition)),
      h('datalist', { id: 'comps' }, comps.map(c => h('option', { value: c }))),
      h('h3', 'Porteros y minutos jugados'), kRows.map(r => r.el),
      h('h3', 'Once (para elegir receptor de pase, opcional)'), players.length ? chips : h('p.muted', 'Añade jugadores en Configuración → Plantilla.'),
      h('div.row', { style: 'margin-top:12px' }, h('button.btn.primary', m ? 'Guardar' : 'Crear partido'), h('button.btn', { type: 'button', onclick: () => form.remove() }, 'Cancelar')));
    page.querySelector('.form-slot').replaceChildren(form);
  }
}
