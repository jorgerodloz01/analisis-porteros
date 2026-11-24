import { start, seed, sampleData, fixtureActions, BASE, assert } from './lib.mjs';
import { readFileSync } from 'node:fs';
const { page, done } = await start();
const data = sampleData();
data.actions = fixtureActions();
data.matches[0].goalsAgainst = 2;
await seed(page, data);

await page.goto(BASE + '#/match/m1/report');
await page.waitForSelector('h1:has-text("Informe")');
const text = await page.locator('main').innerText();
assert.ok(text.includes('50 % (1/2)'), '% paradas');
assert.ok(text.includes('— (0/0)'), '1v1 vacío');
assert.ok(!/NaN|undefined|Infinity/.test(text), 'sin NaN/undefined');
assert.ok(text.includes('mala colocación'), 'notas en la lista');
assert.equal(await page.locator('.kpi:has-text("Goles discutibles") b').innerText(), '0', 'KPI con valor 0 visible');
assert.equal(await page.locator('figure:has-text("Origen de los tiros") .marks circle').count(), 3, 'los 3 tiros aparecen en el mapa');

const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("CSV")')]);
const csv = readFileSync(await dl.path(), 'utf8').replace(/^﻿/, '').trim().split('\n');
assert.equal(csv.length, 10);
assert.ok(csv[0].startsWith('fecha;rival'));

await page.screenshot({ path: 'e2e/shots/report.png', fullPage: true });
await page.emulateMedia({ media: 'print' });
await page.pdf({ path: 'e2e/shots/report.pdf', format: 'A4', landscape: true, printBackground: true });
await page.screenshot({ path: 'e2e/shots/report-print.png', fullPage: true });
await done();
