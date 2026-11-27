// Pasa Tally al Excel de monitorización: wellness → hoja WELLNESS; RPE + «Sesión del día» → hoja CARGA Y READINESS.
// Uso (PowerShell, en la carpeta de la app):
//   node wellness\sincronizar.mjs --simular          → enseña lo que haría, sin tocar el Excel
//   node wellness\sincronizar.mjs                    → escribe en el Excel (tiene que estar cerrado)
//   node wellness\sincronizar.mjs --crear-formularios → una vez: crea en tu Tally «RPE de la sesión» y «Sesión del día»
//   node wellness\sincronizar.mjs --preparar-excel   → una vez: arregla las fórmulas TAKE del DASHBOARD y añade los porteros a CONFIG
//   node wellness\sincronizar.mjs --csv RUTA.csv     → solo wellness, con el CSV descargado de Tally en vez de la API
//   node wellness\sincronizar.mjs --todo             → también días anteriores al último que ya tiene datos en el Excel
//   node wellness\sincronizar.mjs --olvidar-clave    → borra la clave de Tally guardada en este PC
import { readFile, writeFile, mkdir, appendFile, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir, homedir } from 'node:os';
import { spawn } from 'node:child_process';
import readline from 'node:readline/promises';
import { desdeApi, desdeCsv, deduplicar } from './mapeo.js';
import { rpeDesdeApi, sesionesDesdeApi, filasCarga } from './carga.js';
import { formularioRpe, formularioSesion } from './formularios.js';
import { llamarApi, elegirFormulario, idDesdeEnlace, todasLasRespuestas } from './tally-api.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = n => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1]; };
const flag = n => args.includes(n);

const FORMULARIO_DEFECTO = 'WOd9BL'; // https://tally.so/r/WOd9BL · Cuestionario Wellness L'Escala
const LIBRO_DEFECTO = "C:\\Users\\jorge\\OneDrive\\Escritorio\\TEMPORADA 26-27\\PREPARACIÓN FÍSICA\\SISTEMA MONITORIZACIÓN PORTEROS L'ESCALA 26-27 MAESTRO.xlsx";
const DIR_CLAVE = join(process.env.APPDATA ?? join(homedir(), '.config'), 'porteros');
const ARCHIVO_CLAVE = join(DIR_CLAVE, 'tally.json'); // fuera de OneDrive y fuera de git
const REGISTRO = join(AQUI, 'registro.txt');

const leerJson = async (p, def) => { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return def; } };

async function pregunta(texto) {
  if (!process.stdin.isTTY) throw new Error('Falta un dato y no hay ventana para preguntarlo. Ejecútalo una vez a mano desde PowerShell.');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try { return (await rl.question(texto)).trim(); } finally { rl.close(); }
}

async function guardar(datos) {
  await mkdir(DIR_CLAVE, { recursive: true });
  await writeFile(ARCHIVO_CLAVE, JSON.stringify(datos, null, 2), 'utf8');
}

function powershell(script, extra) {
  return new Promise((resolve, reject) => {
    const p = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(AQUI, script), ...extra], { windowsHide: true });
    let out = '', err = '';
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { err += d; });
    p.on('error', e => reject(new Error(`No se pudo abrir PowerShell: ${e.message}`)));
    p.on('close', code => {
      const ultima = out.trim().split(/\r?\n/).pop() ?? '';
      let json = null;
      try { json = JSON.parse(ultima); } catch { /* sin JSON */ }
      if (json?.error) return reject(new Error(json.error));
      if (code !== 0 || !json) return reject(new Error(`Excel/PowerShell falló (código ${code}).\n${(err || out).trim().slice(-800)}`));
      resolve(json);
    });
  });
}

async function conectar(guardado) {
  let clave = process.env.TALLY_API_KEY ?? guardado.apiKey;
  if (!clave) {
    clave = await pregunta('Pega tu clave de la API de Tally (Tally → Settings → API keys) y pulsa Intro: ');
    if (!clave) throw new Error('No has pegado ninguna clave.');
    guardado.apiKey = clave;
    await guardar(guardado);
    console.log(`Clave guardada en ${ARCHIVO_CLAVE} (solo en este PC).`);
  }
  return (ruta, opciones) => llamarApi(clave, ruta, fetch, opciones);
}

async function crearFormularios(api, guardado, porteros) {
  for (const [clave, nombre, cuerpo] of [['rpeFormId', 'RPE de la sesión', formularioRpe(porteros)], ['sesionFormId', 'Sesión del día', formularioSesion()]]) {
    if (guardado[clave] && !flag('--forzar')) { console.log(`«${nombre}» ya estaba creado: https://tally.so/r/${guardado[clave]}`); continue; }
    const f = await api('/forms', { method: 'POST', body: cuerpo });
    guardado[clave] = f.id;
    await guardar(guardado);
    console.log(`«${nombre}» creado: https://tally.so/r/${f.id}`);
  }
  console.log('Ábrelos en Tally para revisarlos (puedes cambiar textos y diseño): el robot los reconoce por el título de cada pregunta.');
}

const tmpJson = async (nombre, datos) => { const p = join(tmpdir(), nombre); await writeFile(p, JSON.stringify(datos), 'utf8'); return p; };
const extra = () => [...(flag('--simular') ? ['-Simular'] : []), ...(flag('--todo') ? ['-Todo'] : [])];

async function main() {
  const cfg = await leerJson(join(AQUI, 'config.json'), {});
  const libro = opt('--libro') ?? cfg.libro ?? LIBRO_DEFECTO;
  const porteros = cfg.porteros ?? ['Jonatan Morilla', 'Oriol Dalmau', 'Lluis Tarrés'];
  const simular = flag('--simular');

  if (flag('--olvidar-clave')) { await unlink(ARCHIVO_CLAVE).catch(() => {}); console.log('Clave de Tally borrada de este PC.'); return; }
  if (flag('--preparar-excel') || flag('--reparar-dashboard')) {
    const r = await powershell('excel-reparar.ps1', ['-Libro', libro, '-Porteros', porteros.join('|')]);
    console.log(`Fórmulas: ${r.cambiadas} reintroducidas (DASHBOARD y FUERZA)${r.tieneTake ? '' : ' (tu Excel no tiene TAKE: cambiadas por INDEX)'}${r.sinCambiar ? `; ${r.sinCambiar} sin tocar` : ''}.`);
    console.log(r.anadidos?.length ? `CONFIG: añadido(s) ${r.anadidos.join(', ')} a la lista de porteros.` : 'CONFIG: la lista de porteros ya estaba completa.');
    return;
  }

  // ── Wellness ──
  const guardado = await leerJson(ARCHIVO_CLAVE, {});
  let api = null;
  let datos;
  if (opt('--csv')) datos = desdeCsv(await readFile(opt('--csv'), 'utf8'), { porteros, alias: cfg.alias });
  else {
    api = await conectar(guardado);
    if (flag('--crear-formularios')) return crearFormularios(api, guardado, porteros);
    let formId = cfg.formId ?? guardado.formId ?? FORMULARIO_DEFECTO;
    if (!formId) {
      formId = elegirFormulario(await api('/forms')) ?? idDesdeEnlace(await pregunta('Pega el enlace del formulario de wellness (tally.so/r/...): '));
      if (!formId) throw new Error('Ese enlace no parece de Tally.');
      guardado.formId = formId; await guardar(guardado);
    }
    datos = desdeApi(await todasLasRespuestas(api, formId), { porteros, alias: cfg.alias });
  }
  const { filas, descartados } = deduplicar(datos.filas);
  console.log(`WELLNESS · Tally: ${filas.length} (portero y día)${descartados.length ? `; ${descartados.length} envío(s) repetido(s) del mismo día: vale el último` : ''}.`);
  for (const a of datos.avisos) console.log('  ⚠ ' + a);
  const w = await powershell('excel-anadir.ps1', ['-Libro', libro, '-Datos', await tmpJson('wellness-filas.json', filas), ...extra()]);
  const resumenW = `Nuevas: ${w.anadidas} · En días ya creados vacíos: ${w.rellenadas} · Ya estaban: ${w.yaEstaban}${w.anteriores ? ` · Anteriores al ${w.ultimoDia} (no se tocan; --todo para incluirlas): ${w.anteriores}` : ''}`;
  console.log((simular ? 'SIMULACIÓN (no se guarda nada) · ' : '') + resumenW);
  if (w.fechas?.length) console.log('  ' + w.fechas.join('\n  '));

  // ── Carga (RPE + sesión del día) ──
  let resumenC = '';
  const rpeId = cfg.rpeFormId ?? guardado.rpeFormId;
  if (api && rpeId) {
    const rpe = rpeDesdeApi(await todasLasRespuestas(api, rpeId), { porteros, alias: cfg.alias });
    const sesId = cfg.sesionFormId ?? guardado.sesionFormId;
    const ses = sesId ? sesionesDesdeApi(await todasLasRespuestas(api, sesId)) : { sesiones: new Map(), avisos: [] };
    const { filas: carga, sinSesion } = filasCarga(rpe.filas, ses.sesiones);
    console.log(`\nCARGA · Tally: ${carga.length} RPE (portero y día).`);
    for (const a of [...rpe.avisos, ...ses.avisos]) console.log('  ⚠ ' + a);
    if (sinSesion.length) console.log(`  ⚠ Sin «Sesión del día» (la fila va sin minutos ni MD): ${sinSesion.join(', ')}`);
    const c = await powershell('excel-carga.ps1', ['-Libro', libro, '-Datos', await tmpJson('carga-filas.json', carga), ...extra()]);
    resumenC = `Nuevas: ${c.anadidas} · Completadas: ${c.completadas} · Ya estaban: ${c.yaEstaban}${c.anteriores ? ` · Anteriores al ${c.ultimoDia}: ${c.anteriores}` : ''}`;
    console.log((simular ? 'SIMULACIÓN · ' : '') + resumenC);
    if (c.fechas?.length) console.log('  ' + c.fechas.join('\n  '));
  }
  if (!simular) await appendFile(REGISTRO, `${new Date().toISOString()} WELLNESS ${resumenW}${resumenC ? ` | CARGA ${resumenC}` : ''}\n`, 'utf8');
}

main().catch(async e => {
  console.error('\n✖ ' + e.message);
  await appendFile(REGISTRO, `${new Date().toISOString()} ERROR ${e.message.split('\n')[0]}\n`, 'utf8').catch(() => {});
  process.exitCode = 1;
});
