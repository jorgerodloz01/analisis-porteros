// Campo vertical (portería propia abajo) y portería 3×3 en SVG.
// Coordenadas normalizadas: x 0→1 izquierda→derecha, y 0 (línea de gol propia) → 1 (rival).
const NS = 'http://www.w3.org/2000/svg';
const W = 68, L = 105;
export const s = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  el.append(...kids);
  return el;
};
export const toSvg = p => ({ x: p.x * W, y: (1 - p.y) * L });

// half: true muestra solo la mitad propia (mapas de tiros).
export function pitchSVG({ onTap, half } = {}) {
  const svg = s('svg', { viewBox: half ? '-3 49 74 59' : '-3 -3 74 111', class: 'pitch', role: onTap ? 'button' : 'img', 'aria-label': 'Campo' });
  for (let i = 0; i < 10; i++) svg.append(s('rect', { x: 0, y: i * L / 10, width: W, height: L / 10, fill: i % 2 ? '#1f7a3a' : '#23873f' }));
  const line = { fill: 'none', stroke: 'rgba(255,255,255,.85)', 'stroke-width': .35 };
  svg.append(
    s('rect', { x: 0, y: 0, width: W, height: L, ...line }),
    s('line', { x1: 0, y1: L / 2, x2: W, y2: L / 2, ...line }),
    s('circle', { cx: W / 2, cy: L / 2, r: 9.15, ...line }),
    ...[0, L].flatMap(gy => {
      const d = gy ? -1 : 1;
      return [
        s('rect', { x: W / 2 - 20.16, y: gy ? L - 16.5 : 0, width: 40.32, height: 16.5, ...line }),
        s('rect', { x: W / 2 - 9.16, y: gy ? L - 5.5 : 0, width: 18.32, height: 5.5, ...line }),
        s('rect', { x: W / 2 - 3.66, y: gy ? L : -2, width: 7.32, height: 2, ...line, fill: 'rgba(255,255,255,.3)' }),
        s('circle', { cx: W / 2, cy: gy + d * 11, r: .5, fill: '#fff' }),
      ];
    }),
    // tercios (líneas de distribución)
    ...[1, 2].map(k => s('line', { x1: 0, x2: W, y1: L - (k * L) / 3, y2: L - (k * L) / 3, stroke: 'rgba(255,255,255,.35)', 'stroke-width': .3, 'stroke-dasharray': '1.5 1.5' })),
  );
  svg.append(s('g', { class: 'marks' }));
  if (onTap) svg.addEventListener('click', e => {
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse());
    const clamp = v => Math.min(1, Math.max(0, v));
    onTap({ x: +clamp(pt.x / W).toFixed(4), y: +clamp(1 - pt.y / L).toFixed(4) });
  });
  return svg;
}

// marks: [{p:{x,y}, color, label, to:{x,y}}]
export function drawMarkers(svg, marks) {
  const g = svg.querySelector('.marks');
  g.replaceChildren();
  for (const m of marks) {
    const a = toSvg(m.p);
    if (m.to) {
      const b = toSvg(m.to);
      g.append(s('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: m.color, 'stroke-width': .5, opacity: .8 }),
        s('circle', { cx: b.x, cy: b.y, r: 1, fill: m.color }));
    }
    g.append(s('circle', { cx: a.x, cy: a.y, r: m.r || 1.6, fill: m.color, stroke: '#000', 'stroke-width': .25 }));
    if (m.label) g.append(s('text', { x: a.x, y: a.y + .8, 'font-size': 2.2, 'text-anchor': 'middle', fill: '#000', 'font-weight': 700 }, m.label));
  }
  return svg;
}

// Portería vista desde el campo. Celdas 0-8 dentro (0 = arriba-izquierda, fila a fila);
// fuera: 9 = por la izquierda, 10 = por encima del larguero, 11 = por la derecha (siempre vista desde el campo).
// counts: {[cell]: texto} opcional para informes; highlight: celda seleccionada.
export const FUERA = { 9: 'Fuera · izquierda', 10: 'Fuera · alto', 11: 'Fuera · derecha' };
export function goalSVG({ onTap, highlight, counts } = {}) {
  const svg = s('svg', { viewBox: '-64 -44 428 162', class: 'goal', 'aria-label': 'Portería vista desde el campo' });
  svg.append(s('rect', { x: -64, y: -44, width: 428, height: 162, fill: '#16223b' }), s('rect', { x: -64, y: 108, width: 428, height: 10, fill: '#1f7a3a' }));
  const zona = (c, x, y, width, height, fill, textoX, textoY) => {
    const el = s('rect', { x, y, width, height, rx: 3, 'data-cell': c, fill: c === highlight ? (c >= 9 ? '#f59e0b' : '#3b82f6') : fill,
      stroke: 'rgba(255,255,255,.35)', 'stroke-dasharray': '3 3', style: onTap ? 'cursor:pointer' : null });
    if (onTap) el.addEventListener('click', () => onTap(c));
    svg.append(el);
    const txt = counts?.[c] ?? (c >= 9 && !counts ? 'Fuera' : null);
    if (txt) svg.append(s('text', { x: textoX, y: textoY, 'text-anchor': 'middle', 'font-size': c >= 9 ? 13 : 16, fill: c >= 9 && !counts?.[c] ? 'rgba(255,255,255,.55)' : '#fff', 'font-weight': 700, 'pointer-events': 'none' }, txt));
  };
  zona(9, -60, -40, 54, 146, 'rgba(255,255,255,.02)', -33, 40);
  zona(11, 306, -40, 54, 146, 'rgba(255,255,255,.02)', 333, 40);
  zona(10, -4, -40, 308, 34, 'rgba(255,255,255,.02)', 150, -18);
  for (let c = 0; c < 9; c++) {
    const x = (c % 3) * 100, y = Math.floor(c / 3) * 36;
    zona(c, x + 1, y + 1, 98, 34, 'rgba(255,255,255,.06)', x + 50, y + 24);
  }
  svg.append(s('path', { d: 'M0 108 V0 H300 V108', fill: 'none', stroke: '#fff', 'stroke-width': 6, 'pointer-events': 'none' }));
  return svg;
}
