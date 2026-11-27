// Un tiro que se va fuera se puede marcar por dónde se fue (izquierda, alto o derecha) y sale en el informe.
import { start, seed, sampleData, BASE, assert } from './lib.mjs';
const { page, done } = await start();
await seed(page, sampleData());

await page.goto(BASE + '#/');
await page.click('text=Nuevo partido');
await page.fill('input[name=rival]', 'UD Fuera');
await page.click('button:has-text("Crear partido")');
await page.waitForSelector('.reg');
await page.click('button:has-text("Iniciar")');

await page.click('.types button:has-text("Tiro")');
await page.click('.steps button:has-text("Zona de portería")');
for (const c of ['9', '10', '11']) assert.equal(await page.locator(`.stage svg.goal [data-cell="${c}"]`).count(), 1, `zona fuera ${c}`);
await page.click('.stage svg.goal [data-cell="10"]');                      // por encima del larguero
await page.click('.steps button:has-text("Zona de portería")');
assert.equal(await page.locator('.stage svg.goal [data-cell="10"]').getAttribute('fill'), '#f59e0b', 'la zona elegida queda marcada');
await page.locator('.stage').screenshot({ path: 'e2e/shots/porteria-fuera.png' });
await page.click('.steps button:has-text("Origen del tiro")');
const box = await page.locator('.stage svg.pitch').boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.3);
await page.click('.steps button:has-text("Resultado")');
await page.click('.options button:has-text("Fuera / poste")');
await page.click('button:has-text("Guardar")');
await page.waitForSelector(".log li:has-text(\"1'\")");

const id = page.url().match(/#\/match\/([^/]+)\//)[1];
await page.goto(BASE + `#/match/${id}/report`);
await page.waitForSelector('h1:has-text("Informe")');
const fig = page.locator('figure:has-text("Destino en portería")');
assert.ok((await fig.locator('text').allTextContents()).some(t => t.startsWith('1')), 'el tiro fuera cuenta en el mapa de portería');
assert.ok(await fig.locator('[data-cell="10"]').count(), 'la zona de fuera aparece en el informe');
await done();
