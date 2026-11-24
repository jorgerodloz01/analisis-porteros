import * as db from './db.js';
import { h, uid, seasonNameFor } from './ui/dom.js';
import { renderSetup } from './ui/setup.js';
import { exportBackup } from './backup.js';

const routes = [
  [/^#\/setup$/, renderSetup],
  [/^#\/match\/([^/]+)\/register$/, (el, id) => import('./ui/register.js').then(m => m.renderRegister(el, id))],
  [/^#\/match\/([^/]+)\/report$/, (el, id) => import('./ui/report.js').then(m => m.renderReport(el, id))],
  [/^#\/season$/, el => import('./ui/season.js').then(m => m.renderSeason(el))],
  [/^#?\/?$/, el => import('./ui/matches.js').then(m => m.renderMatches(el))],
];

async function route() {
  const el = document.getElementById('app');
  const hash = location.hash || '#/';
  document.querySelectorAll('.topbar nav a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === hash));
  document.body.dataset.route = hash.endsWith('/register') ? 'match' : hash.split('/')[1] || 'home';
  for (const [re, fn] of routes) {
    const m = hash.match(re);
    if (m) {
      // Cada navegación pinta en su propio contenedor: un render lento anterior no puede duplicar la página.
      const box = h('div');
      el.replaceChildren(box);
      try { await fn(box, ...m.slice(1)); } catch (e) { console.error(e); box.replaceChildren(h('p.error', 'Error: ' + e.message)); }
      break;
    }
  }
  backupBanner();
}

export async function activeSeasonId() {
  let id = await db.getMeta('activeSeason');
  if (!id || !(await db.get('seasons', id))) {
    const seasons = await db.all('seasons');
    if (!seasons.length) { const s = { id: uid(), name: seasonNameFor() }; await db.put('seasons', s); seasons.push(s); }
    id = seasons[seasons.length - 1].id;
    await db.setMeta('activeSeason', id);
  }
  return id;
}

async function backupBanner() {
  const b = document.getElementById('banner');
  const last = await db.getMeta('lastBackup');
  const hasMatches = (await db.all('matches')).length > 0;
  const stale = hasMatches && (!last || Date.now() - last > 7 * 864e5);
  b.hidden = !stale;
  if (stale) b.replaceChildren(
    last ? 'Hace más de 7 días que no haces copia de seguridad. ' : 'Aún no has hecho ninguna copia de seguridad. ',
    'Los datos solo están en este iPad. ',
    h('button.btn.small', { onclick: async () => { await exportBackup(); backupBanner(); } }, 'Exportar copia'));
}

window.addEventListener('hashchange', route);
route();
if ('serviceWorker' in navigator && isSecureContext) navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e));
