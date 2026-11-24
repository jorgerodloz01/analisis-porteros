import { start, seed, sampleData, BASE, assert } from './lib.mjs';
const { page, context, done } = await start();
await seed(page, sampleData());
await page.goto(BASE);
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload();                       // la página ya bajo control del SW
await page.waitForFunction(() => navigator.serviceWorker.controller);
// visitar todas las pantallas para que sus módulos queden en caché
for (const r of ['#/season', '#/setup', '#/match/m1/report', '#/match/m1/register', '#/']) { await page.goto(BASE + r); await page.waitForTimeout(300); }
await context.setOffline(true);
await page.reload();
await page.waitForSelector('.match-row:has-text("CD Rival")');
await page.goto(BASE + '#/match/m1/register'); await page.waitForSelector('.reg');
await page.goto(BASE + '#/season'); await page.waitForSelector('h1:has-text("Temporada")');
assert.ok(await page.evaluate(() => !!document.querySelector('link[rel=manifest]')));
await done();
