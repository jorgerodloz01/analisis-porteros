// Render con ffmpeg: cada clip se codifica una vez y se concatena sin recodificar.
// Los argumentos van sin shell (rutas con espacios, tildes y apóstrofos tal cual) y los rótulos por archivo de texto.
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, copyFile, rm, mkdir, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { VENTANAS } from './clips.js';

const W = 1920, H = 1080, FPS = 30, FADE = 0.25;
const BG = '0x0b1220';
const n3 = x => Number(x).toFixed(3);
const num = x => String(Math.round(x * 1000) / 1000);

const ENCODE = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-r', String(FPS), '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-b:a', '128k', '-video_track_timescale', '30000'];

const fades = (kind, dur) => `${kind}=t=in:st=0:d=${FADE},${kind}=t=out:st=${num(Math.max(0, dur - FADE))}:d=${FADE}`;

const drawLabel = ({ file, from, to }) =>
  `drawtext=fontfile=font.ttf:textfile=${file}:x=40:y=h-th-48:fontsize=40:fontcolor=white:box=1:boxcolor=${BG}@0.78:boxborderw=18:enable='between(t,${num(from)},${num(to)})'`;

export function clipArgs({ video, start, dur, hasAudio, labels = [], out }) {
  const v = [`[0:v]scale=${W}:${H}:force_original_aspect_ratio=decrease`, `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black`,
    'setsar=1', `fps=${FPS}`, 'format=yuv420p', fades('fade', dur), ...labels.map(drawLabel)].join(',') + '[v]';
  const a = hasAudio ? `;[0:a]aresample=48000,aformat=channel_layouts=stereo,${fades('afade', dur)}[a]` : '';
  return ['-y', '-hide_banner', '-loglevel', 'error', '-ss', n3(start), '-i', video,
    ...(hasAudio ? [] : ['-f', 'lavfi', '-t', n3(dur), '-i', 'anullsrc=r=48000:cl=stereo']),
    '-t', n3(dur), '-filter_complex', v + a, '-map', '[v]', '-map', hasAudio ? '[a]' : '1:a', ...ENCODE, out];
}

export function titleArgs({ lines, out, dur = 3 }) {
  const sizes = [72, 44, 36];
  const draws = lines.map((file, i) =>
    `drawtext=fontfile=font.ttf:textfile=${file}:x=(w-tw)/2:y=${[400, 520, 600][i] ?? 600 + 70 * (i - 2)}:fontsize=${sizes[i] ?? 36}:fontcolor=${i ? '0xc7d2fe' : 'white'}`);
  return ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=${BG}:s=${W}x${H}:r=${FPS}:d=${dur}`,
    '-f', 'lavfi', '-t', String(dur), '-i', 'anullsrc=r=48000:cl=stereo',
    '-filter_complex', `[0:v]${[...draws, 'format=yuv420p', fades('fade', dur)].join(',')}[v]`, '-map', '[v]', '-map', '1:a', ...ENCODE, out];
}

// Intervalo (relativo al clip) en que se ve el rótulo de cada acción: desde que empieza su jugada hasta la siguiente.
export function labelWindows(clip, ventanas = VENTANAS) {
  const dur = clip.end - clip.start;
  const froms = clip.actions.map((a, i) => (i === 0 ? 0 : Math.max(0, a.at - (ventanas[a.type]?.[0] ?? 10))));
  for (let i = 1; i < froms.length; i++) froms[i] = Math.min(dur, Math.max(froms[i], froms[i - 1]));
  return froms.map((from, i) => ({ from, to: i + 1 < froms.length ? froms[i + 1] : dur }));
}

export function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    let err = '';
    const p = spawn(cmd, args, { cwd, windowsHide: true });
    p.stderr.on('data', d => { err = (err + d).slice(-4000); });
    p.stdout.on('data', d => { err = (err + d).slice(-4000); });
    p.on('error', e => reject(e.code === 'ENOENT' ? new Error(`No se encuentra ${cmd}. Instálalo con: winget install --id Gyan.FFmpeg -e`) : e));
    p.on('close', code => (code === 0 ? resolve(err) : reject(new Error(`${cmd} terminó con error ${code}:\n${err.trim().split('\n').slice(-6).join('\n')}`))));
  });
}

export async function probe(video, ffprobe = 'ffprobe') {
  const out = await run(ffprobe, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', video]);
  const j = JSON.parse(out);
  const vs = j.streams?.find(s => s.codec_type === 'video');
  return { duration: Number(j.format?.duration) || 0, hasAudio: !!j.streams?.some(s => s.codec_type === 'audio'), width: vs?.width, height: vs?.height };
}

const exists = p => access(p).then(() => true, () => false);

export async function findFont(candidates = process.platform === 'win32'
  ? ['C:\\Windows\\Fonts\\arialbd.ttf', 'C:\\Windows\\Fonts\\arial.ttf', 'C:\\Windows\\Fonts\\segoeuib.ttf']
  : ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf']) {
  for (const c of candidates) if (await exists(c)) return c;
  return null;
}

// clips: [{start, end, actions:[{type, label, at, parada}]}] ya filtrados y ordenados.
export async function renderJob({ video, clips, titles, outAcciones, outParadas, onProgress = () => {}, ffmpeg = 'ffmpeg', ffprobe = 'ffprobe' }) {
  if (!clips.length) throw new Error('No hay clips que generar.');
  const font = await findFont();
  if (!font) throw new Error('No se encuentra una fuente para los rótulos (Arial).');
  const { hasAudio } = await probe(video, ffprobe);
  const tmp = await mkdtemp(join(tmpdir(), 'video-porteros-'));
  try {
    await copyFile(font, join(tmp, 'font.ttf'));
    const paradas = outParadas ? clips.filter(c => c.actions.some(a => a.parada)) : [];
    const total = clips.length + 1 + (paradas.length ? 1 : 0) + 1;
    let hecho = 0;
    const step = fase => onProgress({ fase, hecho: ++hecho, total });

    const files = [];
    for (const [i, clip] of clips.entries()) {
      const id = String(i).padStart(3, '0');
      const wins = labelWindows(clip);
      const labels = [];
      for (const [j, a] of clip.actions.entries()) {
        const file = `l_${id}_${j}.txt`;
        await writeFile(join(tmp, file), a.label, 'utf8');
        labels.push({ file, ...wins[j] });
      }
      const out = `clip_${id}.mp4`;
      await run(ffmpeg, clipArgs({ video, start: clip.start, dur: clip.end - clip.start, hasAudio, labels, out }), tmp);
      files.push({ out, clip });
      step(`Clip ${i + 1} de ${clips.length}`);
    }

    const title = async (name, lines) => {
      const fl = [];
      for (const [i, l] of lines.entries()) { const f = `${name}_${i}.txt`; await writeFile(join(tmp, f), l, 'utf8'); fl.push(f); }
      await run(ffmpeg, titleArgs({ lines: fl, out: `${name}.mp4` }), tmp);
      return `${name}.mp4`;
    };
    const concat = async (list, dest) => {
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(join(tmp, 'lista.txt'), list.map(f => `file '${f}'`).join('\n'), 'utf8');
      await run(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', 'lista.txt', '-c', 'copy', '-movflags', '+faststart', dest], tmp);
    };

    const t1 = await title('portada', titles.acciones);
    step('Portada');
    await concat([t1, ...files.map(f => f.out)], outAcciones);
    step('Vídeo de acciones');
    let outP = null;
    if (paradas.length) {
      const t2 = await title('portada_paradas', titles.paradas);
      await concat([t2, ...files.filter(f => paradas.includes(f.clip)).map(f => f.out)], outParadas);
      outP = outParadas;
      step('Vídeo de paradas');
    }
    return { acciones: outAcciones, paradas: outP, clips: clips.length, paradasClips: paradas.length };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
