import { start, seed, sampleData, fixtureActions, BASE, assert } from './lib.mjs';
const { page, done } = await start();
const data = sampleData();
data.keepers.push({ id: 'k3', name: 'Eva Ruiz', number: '25', photo: null, active: true });
const base = data.matches[0];
data.matches = [
  { ...base, id: 'm1', date: '2026-10-04', keepers: [{ keeperId: 'k1', minutes: 90 }] },
  { ...base, id: 'm2', date: '2026-10-11', rival: 'CF Dos', keepers: [{ keeperId: 'k1', minutes: 45 }, { keeperId: 'k2', minutes: 45 }] },
  { ...base, id: 'm3', date: '2026-10-18', rival: 'UE Tres', competition: 'Copa', keepers: [{ keeperId: 'k2', minutes: 90 }, { keeperId: 'k3', minutes: 0 }] },
];
data.actions = [...fixtureActions('m1', 'k1'), ...fixtureActions('m2', 'k1'), ...fixtureActions('m2', 'k2').slice(0, 3), ...fixtureActions('m3', 'k2')];
await seed(page, data);

await page.goto(BASE + '#/season');
await page.waitForSelector('h1:has-text("Temporada")');
await page.click('.keeper-pick button:has-text("Sofía Fuente")');
await page.waitForSelector('.season-keeper:has-text("135")');
assert.equal(await page.locator('table.evo tbody tr').count(), 2, '2 partidos de Sofía');
assert.ok(await page.locator('svg.evo-chart path.line').count() >= 1, 'gráfico de evolución');
assert.ok(!(await page.locator('main').innerText()).includes('[object'), 'bloque acumulado renderizado');
assert.notEqual(await page.locator('.evo .legend i').first().evaluate(e => getComputedStyle(e).backgroundColor), 'rgba(0, 0, 0, 0)', 'leyenda con color');

await page.click('.keeper-pick button:has-text("Eva Ruiz")');
await page.waitForSelector('.season-keeper:has-text("Eva Ruiz")');
const evaText = await page.locator('main').innerText();
assert.ok(!/NaN|Infinity|undefined/.test(evaText), 'sin NaN con 0 minutos');
assert.ok(evaText.includes('—'), 'por-90 muestra —');

await page.click('.keeper-pick button:has-text("Comparar")');
await page.waitForSelector('table.compare');
assert.equal(await page.locator('table.compare thead th').count(), 4, 'métrica + 3 porteros');
await page.screenshot({ path: 'e2e/shots/season-compare.png', fullPage: true });

// filtro de competición: solo Copa → Sofía sin partidos
await page.selectOption('select[name=competition]', 'Copa');
await page.click('.keeper-pick button:has-text("Sofía Fuente")');
await page.waitForSelector('.season-keeper');
assert.equal(await page.locator('table.evo tbody tr').count(), 0);
await page.selectOption('select[name=competition]', '');
await page.click('.keeper-pick button:has-text("Sofía Fuente")');
await page.waitForSelector('table.evo tbody tr');
await page.screenshot({ path: 'e2e/shots/season.png', fullPage: true });

const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("CSV")')]);
assert.ok(dl.suggestedFilename().endsWith('.csv'));
await done();
