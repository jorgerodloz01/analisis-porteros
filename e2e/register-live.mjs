import { start, seed, sampleData, BASE, assert } from './lib.mjs';
const { page, done } = await start();
await seed(page, sampleData());

// crear partido desde la lista
await page.goto(BASE + '#/');
await page.click('text=Nuevo partido');
await page.fill('input[name=rival]', 'UD Prueba');
await page.click('button:has-text("Crear partido")');
await page.waitForSelector('.reg');
assert.ok(await page.locator('.reg-head:has-text("UD Prueba")').count());

const tapPitch = async (x, y) => {           // x,y normalizados (y=0 portería propia)
  const box = await page.locator('.stage svg.pitch').boundingBox();
  const vb = { w: 74, h: 111, ox: -3, oy: -3 };
  const sx = box.width / vb.w, sy = box.height / vb.h, s = Math.min(sx, sy);
  const offX = box.x + (box.width - vb.w * s) / 2, offY = box.y + (box.height - vb.h * s) / 2;
  await page.mouse.click(offX + (x * 68 - vb.ox) * s, offY + ((1 - y) * 105 - vb.oy) * s);
};

await page.click('button:has-text("Iniciar")');
await page.click('.types button:has-text("Tiro")');
assert.ok(await page.locator('button:has-text("Guardar")').isDisabled());
await tapPitch(0.5, 0.85);                    // origen
await page.click('.steps button:has-text("Zona de portería")');
await page.click('.stage svg.goal [data-cell="0"]');
await page.click('.steps button:has-text("Resultado")');
await page.click('.options button:has-text("Gol")');
await page.click('.options button:has-text("Sí")');
await page.click('button:has-text("Guardar")');
await page.waitForSelector(".log li:has-text(\"1'\")");
assert.ok(await page.locator('.reg-head .score:has-text("0 - 1")').count(), 'marcador sube con gol');

await page.click('.reg-tabs button:has-text("Distribución")');
await page.click('.types button:has-text("Pase en juego")');
await tapPitch(0.5, 0.05);
await tapPitch(0.4, 0.8);
await page.click('.steps button:has-text("Resultado")');
await page.click('.options button:has-text("Completado")');
await page.click('button:has-text("Guardar")');
await page.waitForFunction(() => document.querySelectorAll('.log li').length === 2);

await page.waitForTimeout(1200);
const before = await page.locator('.clock').innerText();
await page.reload();
await page.waitForSelector('.reg');
assert.equal(await page.locator('.log li').count(), 2, 'acciones persisten tras recarga');
await page.waitForTimeout(300);
const after = await page.locator('.clock').innerText();
assert.ok(after >= before && after !== '00:00', `reloj sigue: ${before} → ${after}`);

// ajustar reloj no cambia minutos guardados
await page.click('button:has-text("+1′")');
assert.equal(await page.locator(".log li:has-text(\"1'\")").count(), 2);

await page.screenshot({ path: 'e2e/shots/register.png' });

// minuto con añadido, confirmación al descartar y limpieza de pasos ocultos
const answers = []; let prompts = 0;
page.removeAllListeners('dialog');
page.on('dialog', d => { answers.push(d.message()); d.accept(d.type() === 'prompt' ? (++prompts === 1 ? '30+1' : '45+2') : undefined); });
await page.click('.reg-tabs button:has-text("Defensa")');
await page.click('.types button:has-text("Tiro")');
await tapPitch(0.5, 0.15);
await page.click('.types button:has-text("Centro lateral")');
assert.equal(answers.length, 1, 'pide confirmar descarte');
await page.click('.types button:has-text("Tiro")');
assert.equal(answers.length, 1, 'sin datos no pregunta');
await page.click('.steps button:has-text("⏱")');
assert.ok(await page.locator(".stage-title:has-text(\"45+2'\")").count(), 'minuto 45+2 tras reintento');
assert.ok(answers[2].includes('no válido'), 'reintento al minuto inválido');
await tapPitch(0.5, 0.15);
await page.click('.steps button:has-text("Zona de portería")');
await page.click('.stage svg.goal [data-cell="4"]');
await page.click('.steps button:has-text("Resultado")');
await page.click('.options button:has-text("Gol")');
await page.click('.options button:has-text("Sí")');
await page.click('.steps button:has-text("Resultado")');
await page.click('.options button:has-text("Blocaje")');
await page.click('button:has-text("Guardar")');
await page.waitForFunction(() => document.querySelectorAll('.log li').length === 3);
const saved = await page.evaluate(async () => (await (await import('./js/db.js')).all('actions')).find(a => a.attrs.resultado === 'blocaje'));
assert.equal(saved.attrs.evitable, undefined, 'evitable eliminado al no ser gol');
assert.equal(saved.half, 1); assert.equal(saved.t, 2760);
assert.ok(await page.locator(".log li:has-text(\"45+2'\")").count());

// deshacer última
await page.click('button:has-text("Deshacer última")');
await page.waitForFunction(() => document.querySelectorAll('.log li').length === 2);

// borrar
await page.locator('.log li').first().locator('button:has-text("✕")').click();
await page.waitForFunction(() => document.querySelectorAll('.log li').length === 1);
await done();
