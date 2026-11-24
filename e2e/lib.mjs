import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
export { assert };

const root = fileURLToPath(new URL('..', import.meta.url));
export const BASE = 'http://localhost:8123/';

export async function start() {
  const srv = spawn('python3', ['-m', 'http.server', '8123', '-d', root], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 600));
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  const done = async () => {
    await browser.close(); srv.kill();
    if (errors.length) { console.error('Errores de página:', errors); process.exit(1); }
    console.log('OK');
  };
  return { page, context, done, errors };
}

// Siembra datos vía la propia app (replaceAll) y recarga.
export async function seed(page, data) {
  await page.goto(BASE + '#/setup');
  await page.evaluate(async d => { const db = await import('./js/db.js'); await db.replaceAll(d); await db.setMeta('activeSeason', d.seasons[0]?.id); await db.setMeta('lastBackup', Date.now()); }, data);
}

export const sampleData = () => ({
  seasons: [{ id: 's1', name: '2026-27' }],
  keepers: [{ id: 'k1', name: 'Sofía Fuente', number: '1', photo: null, active: true }, { id: 'k2', name: 'Laura Gil', number: '13', photo: null, active: true }],
  players: [{ id: 'p4', number: 4, name: 'Ana' }, { id: 'p8', number: 8, name: 'Marta' }],
  matches: [{ id: 'm1', seasonId: 's1', date: '2026-11-21', rival: 'CD Rival', home: true, competition: 'Liga', goalsFor: 0, goalsAgainst: 0,
    keepers: [{ keeperId: 'k1', minutes: 90 }], lineup: ['p4', 'p8'], clock: { half: 1, running: false, startedAt: null, accumulated: 0 }, finished: false }],
  actions: [],
});

// Mismas acciones que tests/logic.test.js (fixture).
export const fixtureActions = (matchId = 'm1', keeperId = 'k1') => {
  const A = (i, type, attrs, points) => ({ id: `${matchId}-a${i}`, matchId, keeperId, half: i < 5 ? 1 : 2, t: i * 60, type, attrs, points, note: i === 0 ? 'mala colocación' : '', createdAt: i });
  return [
    A(0, 'tiro', { resultado: 'gol', evitable: 'si' }, { origen: { x: .5, y: .12 }, porteria: 0 }),
    A(1, 'tiro', { resultado: 'blocaje' }, { origen: { x: .4, y: .2 }, porteria: 4 }),
    A(2, 'tiro', { resultado: 'fuera_poste' }, { origen: { x: .65, y: .3 }, porteria: 2 }),
    A(3, 'penalti', { resultado: 'gol', lado_portero: 'izq' }, { lanzamiento: 5 }),
    A(4, 'centro', { decision: 'sale', resultado: 'exito', valoracion: 'correcta' }, { origen: { x: .95, y: .15 } }),
    A(5, 'centro', { decision: 'se_queda', resultado: 'fallo', valoracion: 'debia_salir' }, { origen: { x: .05, y: .2 } }),
    A(6, 'pase', { resultado: 'completado', altura: 'raso' }, { origen: { x: .5, y: .05 }, destino: { x: .3, y: .5 } }),
    A(7, 'pase', { resultado: 'perdido', altura: 'alto' }, { origen: { x: .5, y: .05 }, destino: { x: .6, y: .8 } }),
    A(8, 'saque_puerta', { resultado: 'segunda_ganada' }, { origen: { x: .5, y: .05 }, destino: { x: .7, y: .2 } }),
  ];
};
