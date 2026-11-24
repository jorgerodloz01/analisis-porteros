// Genera icon-192.png e icon-512.png (portería + balón) con el Chromium de Playwright.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch(); const p = await b.newPage();
for (const n of [192, 512]) {
  const data = await p.evaluate(n => {
    const c = document.createElement('canvas'); c.width = c.height = n; const x = c.getContext('2d'); const u = n / 100;
    x.fillStyle = '#0b1220'; x.fillRect(0, 0, n, n);
    x.fillStyle = '#1f7a3a'; x.fillRect(0, 68 * u, n, 32 * u);
    x.strokeStyle = '#fff'; x.lineWidth = 5 * u; x.lineJoin = 'round';
    x.beginPath(); x.moveTo(18 * u, 70 * u); x.lineTo(18 * u, 30 * u); x.lineTo(82 * u, 30 * u); x.lineTo(82 * u, 70 * u); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 1.2 * u;
    for (let i = 1; i < 6; i++) { x.beginPath(); x.moveTo((18 + i * 64 / 6) * u, 32 * u); x.lineTo((18 + i * 64 / 6) * u, 68 * u); x.stroke(); }
    for (let i = 1; i < 4; i++) { x.beginPath(); x.moveTo(20 * u, (30 + i * 10) * u); x.lineTo(80 * u, (30 + i * 10) * u); x.stroke(); }
    x.fillStyle = '#facc15'; x.beginPath(); x.arc(50 * u, 52 * u, 10 * u, 0, 7); x.fill();
    return c.toDataURL('image/png').split(',')[1];
  }, n);
  writeFileSync(new URL(`../icon-${n}.png`, import.meta.url), Buffer.from(data, 'base64'));
}
await b.close(); console.log('iconos OK');
