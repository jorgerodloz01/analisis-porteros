import * as db from '../db.js';
import { h, uid } from './dom.js';
import { exportBackup, importBackup } from '../backup.js';
import { activeSeasonId } from '../app.js';

export async function resizeImage(file, max = 256) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return c.toDataURL('image/jpeg', 0.85);
}

export const avatar = (k, cls = 'avatar') =>
  k?.photo ? h('img.' + cls, { src: k.photo, alt: k.name }) : h('span.' + cls + '.placeholder', (k?.name || '?')[0]);

export async function renderSetup(el) {
  const activeId = await activeSeasonId();
  const [seasons, keepers, players] = await Promise.all([db.all('seasons'), db.all('keepers'), db.all('players')]);
  const rerender = () => { el.replaceChildren(); renderSetup(el); };
  const msg = h('p.msg', { role: 'status' });

  // --- Temporadas
  const seasonName = h('input', { placeholder: 'p. ej. 2027-28', required: true });
  const seasonsBox = h('section.card',
    h('h2', 'Temporadas'),
    h('ul.list', seasons.map(s => h('li',
      h('span', s.name, s.id === activeId ? h('span.tag', 'activa') : null),
      s.id === activeId ? null : h('button.btn.small', { onclick: async () => { await db.setMeta('activeSeason', s.id); rerender(); } }, 'Activar')))),
    h('form.row', { onsubmit: async e => { e.preventDefault(); const s = { id: uid(), name: seasonName.value.trim() }; await db.put('seasons', s); await db.setMeta('activeSeason', s.id); rerender(); } },
      seasonName, h('button.btn', 'Añadir temporada')));

  // --- Porteros
  const keeperForm = (k = { id: uid(), name: '', number: '', photo: null, active: true }) => {
    let photo = k.photo;
    const fmsg = h('p.msg', { role: 'status' });
    const preview = h('div.preview', avatar(k, 'avatar.big'));
    const name = h('input', { value: k.name, placeholder: 'Nombre', required: true, name: 'kname' });
    const number = h('input', { value: k.number, placeholder: 'Dorsal', inputMode: 'numeric', size: 4, name: 'knumber' });
    const file = h('input', { type: 'file', accept: 'image/*', name: 'kphoto', onchange: async () => {
      try {
        photo = await resizeImage(file.files[0]);
        preview.replaceChildren(h('img.avatar.big', { src: photo, alt: '' }));
        fmsg.textContent = '';
      } catch { fmsg.textContent = 'No se pudo leer la imagen (prueba con JPG/PNG).'; file.value = ''; }
    } });
    return h('form.keeper-form', { onsubmit: async e => {
      e.preventDefault();
      await db.put('keepers', { ...k, name: name.value.trim(), number: number.value.trim(), photo });
      rerender();
    } }, preview, h('label.file', 'Foto', file), name, number, h('button.btn', k.name ? 'Guardar' : 'Añadir portero'), fmsg);
  };
  const keepersBox = h('section.card',
    h('h2', 'Porteros'),
    h('div.keepers', keepers.map(k => h('div.keeper' + (k.active ? '' : '.inactive'),
      avatar(k, 'avatar.big'), h('strong', k.name), h('span.muted', k.number ? `#${k.number}` : ''),
      h('div.row',
        h('button.btn.small', { onclick: e => e.currentTarget.closest('.keeper').replaceWith(keeperForm(k)) }, 'Editar'),
        h('button.btn.small', { onclick: async () => { await db.put('keepers', { ...k, active: !k.active }); rerender(); } }, k.active ? 'Desactivar' : 'Activar'))))),
    h('h3', 'Nuevo portero'), keeperForm());

  // --- Plantilla
  const pNum = h('input', { type: 'number', min: 1, max: 99, placeholder: 'Dorsal', style: 'width:100px', required: true });
  const pName = h('input', { placeholder: 'Nombre' });
  const playersBox = h('section.card',
    h('h2', 'Plantilla (receptores de pase)'),
    h('ul.list', players.sort((a, b) => a.number - b.number).map(p => h('li',
      h('span', h('b', `#${p.number}`), ' ', p.name),
      h('button.btn.small.danger', { onclick: async () => { await db.del('players', p.id); rerender(); } }, 'Quitar')))),
    h('form.row', { onsubmit: async e => { e.preventDefault(); await db.put('players', { id: uid(), number: Number(pNum.value), name: pName.value.trim() }); rerender(); } },
      pNum, pName, h('button.btn', 'Añadir')));

  // --- Copias
  const imp = h('input', { type: 'file', accept: 'application/json,.json', name: 'import', onchange: async () => {
    let err;
    try { err = await importBackup(imp.files[0]); } catch (e) { err = 'No se pudo importar: ' + e.message; }
    imp.value = '';
    if (err === 'cancel') return;
    if (err) msg.textContent = err; else { await db.setMeta('activeSeason', null); rerender(); }
  } });
  const backupBox = h('section.card',
    h('h2', 'Copia de seguridad'),
    h('p.muted', 'Los datos solo se guardan en este iPad. Exporta una copia tras cada partido y guárdala en Archivos/iCloud.'),
    h('div.row', h('button.btn', { onclick: exportBackup }, 'Exportar copia'), h('label.btn.file', 'Importar copia', imp)));

  el.append(h('div.page', h('h1', 'Configuración'), msg, keepersBox, playersBox, seasonsBox, backupBox));
}
