// h('div.clase', {onclick, ...props}, ...hijos) — constructor mínimo de DOM.
export function h(sel, props, ...kids) {
  const [tag, ...cls] = sel.split('.');
  const el = document.createElement(tag || 'div');
  if (cls.length) el.className = cls.join(' ');
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) { kids.unshift(props); props = null; }
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style' || k.startsWith('data') || k.startsWith('aria') || k === 'for') el.setAttribute(k, v);
    else el[k] = v;
  }
  el.append(...kids.flat(Infinity).filter(k => k != null && k !== false));
  return el;
}

export const uid = () => crypto.randomUUID();

export function seasonNameFor(date = new Date()) {
  const y = date.getFullYear(), start = date.getMonth() >= 6 ? y : y - 1; // la temporada empieza en julio
  return `${start}-${String(start + 1).slice(2)}`;
}
