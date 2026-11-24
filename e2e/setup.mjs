import { start, BASE, assert } from './lib.mjs';
const { page, done } = await start();

await page.goto(BASE + '#/setup');
await page.waitForSelector('h1:has-text("Configuración")');
// temporada creada automáticamente
assert.ok(await page.locator('text=activa').count() === 1);

const b64 = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 4000; c.height = 3000; const x = c.getContext('2d'); x.fillStyle = '#c33'; x.fillRect(0, 0, 4000, 3000); return c.toDataURL('image/png').split(',')[1]; });
const form = page.locator('form.keeper-form').last();
await form.locator('input[name=kphoto]').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') });
await form.locator('img.avatar').waitFor();
await form.locator('input[name=kname]').fill('Sofía Fuente');
await form.locator('input[name=knumber]').fill('1');
await form.locator('button').click();
await page.waitForSelector('.keeper strong:has-text("Sofía Fuente")');
await page.reload();
const img = page.locator('.keeper img.avatar');
await img.waitFor();
const w = await img.evaluate(i => i.naturalWidth);
assert.ok(w > 0 && w <= 256, 'foto reducida: ' + w);

// importar archivo inválido no borra nada
await page.locator('input[name=import]').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"foo":1}') });
await page.waitForSelector('.msg:has-text("no es una copia")');
assert.equal(await page.locator('.keeper').count(), 1);

// HEIC/no imagen → mensaje
await page.locator('form.keeper-form').last().locator('input[name=kphoto]').setInputFiles({ name: 'x.heic', mimeType: 'image/heic', buffer: Buffer.from('nope') });
await page.waitForSelector('.msg:has-text("No se pudo leer la imagen")');

await page.screenshot({ path: 'e2e/shots/setup.png' });
await done();
