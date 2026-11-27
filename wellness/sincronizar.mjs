// Pasa el wellness de Tally a la hoja WELLNESS del Excel de monitorización.
// Uso (PowerShell, en la carpeta de la app):
//   node wellness\sincronizar.mjs --simular        → enseña lo que haría, sin tocar el Excel
//   node wellness\sincronizar.mjs                  → escribe en el Excel (tiene que estar cerrado)
//   node wellness\sincronizar.mjs --csv RUTA.csv   → igual, pero con el CSV descargado de Tally en vez de la API
//   node wellness\sincronizar.mjs --todo           → también días anteriores al último que ya tiene datos en el Excel
//   node wellness\sincronizar.mjs --reparar-dashboard   → reintroduce las fórmulas TAKE del DASHBOARD (una vez)
//   node wellness\sincronizar.mjs --olvidar-clave  → borra la clave de Tally guardada en este PC
import { readFile, writeFile, mkdir, appendFile, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir, homedir } from 'node:os';
import { spawn } from 'node:child_process';
import readline from 'node:readline/promises';
import { desdeApi, desdeCsv, deduplicar } from './mapeo.js';
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

async function guardarClave(datos) {
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

async function leerTally(cfg, porteros) {
  if (opt('--csv')) return desdeCsv(await readFile(opt('--csv'), 'utf8'), { porteros, alias: cfg.alias });
  const guardado = await leerJson(ARCHIVO_CLAVE, {});
  let clave = process.env.TALLY_API_KEY ?? guardado.apiKey;
  if (!clave) {
    clave = await pregunta('Pega tu clave de la API de Tally (Tally → Settings → API keys) y pulsa Intro: ');
    if (!clave) throw new Error('No has pegado ninguna clave.');
    guardado.apiKey = clave;
    await guardarClave(guardado);
    console.log(`Clave guardada en ${ARCHIVO_CLAVE} (solo en este PC).`);
  }
  const api = ruta => llamarApi(clave, ruta);
  let formId = cfg.formId ?? guardado.formId ?? FORMULARIO_DEFECTO;
  if (!formId) {
    formId = elegirFormulario(await api('/forms'));
    if (!formId) formId = idDesdeEnlace(await pregunta('No encuentro un único formulario con «wellness» en el nombre. Pega su enlace (tally.so/r/...): '));
    if (!formId) throw new Error('Ese enlace no parece de Tally.');
    guardado.formId = formId;
    await guardarClave(guardado);
  }
  return desdeApi(await todasLasRespuestas(api, formId), { porteros, alias: cfg.alias });
}

async function main() {
  const cfg = await leerJson(join(AQUI, 'config.json'), {});
  const libro = opt('--libro') ?? cfg.libro ?? LIBRO_DEFECTO;
  const porteros = cfg.porteros ?? ['Jonatan Morilla', 'Oriol Dalmau'];

  if (flag('--olvidar-clave')) { await unlink(ARCHIVO_CLAVE).catch(() => {}); console.log('Clave de Tally borrada de este PC.'); return; }
  if (flag('--reparar-dashboard')) {
    const r = await powershell('excel-reparar.ps1', ['-Libro', libro]);
    console.log(`DASHBOARD: ${r.cambiadas} fórmulas reintroducidas${r.tieneTake ? '' : ' (tu Excel no tiene TAKE: cambiadas por INDEX)'}${r.sinCambiar ? `; ${r.sinCambiar} sin tocar` : ''}.`);
    return;
  }

  const datos = await leerTally(cfg, porteros);
  const { filas, descartados } = deduplicar(datos.filas);
  console.log(`Tally: ${filas.length} wellness (portero y día)${descartados.length ? `; ${descartados.length} envío(s) repetido(s) del mismo día: vale el último` : ''}.`);
  for (const a of datos.avisos) console.log('  ⚠ ' + a);

  const tmp = join(tmpdir(), 'wellness-filas.json');
  await writeFile(tmp, JSON.stringify(filas), 'utf8');
  const simular = flag('--simular');
  const r = await powershell('excel-anadir.ps1', ['-Libro', libro, '-Datos', tmp, ...(simular ? ['-Simular'] : []), ...(flag('--todo') ? ['-Todo'] : [])]);
  const resumen = `${simular ? 'SIMULACIÓN (no se ha guardado nada) · ' : ''}Nuevas: ${r.anadidas} · En días ya creados vacíos: ${r.rellenadas} · Ya estaban: ${r.yaEstaban}`
    + (r.anteriores ? ` · Anteriores al ${r.ultimoDia} (no se tocan; --todo para incluirlas): ${r.anteriores}` : '');
  console.log(resumen);
  if (r.fechas?.length) console.log('  ' + r.fechas.join('\n  '));
  if (!simular) await appendFile(REGISTRO, `${new Date().toISOString()} ${resumen}\n`, 'utf8');
}

main().catch(async e => {
  console.error('\n✖ ' + e.message);
  await appendFile(REGISTRO, `${new Date().toISOString()} ERROR ${e.message.split('\n')[0]}\n`, 'utf8').catch(() => {});
  process.exitCode = 1;
});
