import { spawn } from 'node:child_process';
import { mkdir, readdir, stat } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';

interface TranscodeArgs {
  inputs: string[];
  out: string;
  bitrate: string;
  formats: ('webm' | 'm4a')[];
}

/**
 * The asset-formats guide ffmpeg loop, packaged. For each input file produces:
 *   <name>.webm  (libopus)   — small, plays everywhere except old iOS Safari.
 *   <name>.m4a   (aac)       — fallback for the codec ladder.
 *
 * Requires ffmpeg on PATH. The CLI is a thin wrapper — we don't bundle ffmpeg.
 */
export async function runTranscode(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  await mkdir(args.out, { recursive: true });
  const expanded = await expandInputs(args.inputs);
  if (expanded.length === 0) {
    process.stderr.write('No input files matched.\n');
    process.exit(1);
  }
  for (const input of expanded) {
    const name = basename(input, extname(input));
    for (const fmt of args.formats) {
      const target = join(args.out, `${name}.${fmt}`);
      const codecArgs =
        fmt === 'webm'
          ? ['-c:a', 'libopus', '-b:a', args.bitrate, '-vn']
          : ['-c:a', 'aac', '-b:a', args.bitrate, '-vn'];
      await runFfmpeg(['-y', '-i', input, ...codecArgs, target]);
      process.stdout.write(`  → ${target}\n`);
    }
  }
}

function parseArgs(argv: string[]): TranscodeArgs {
  const out: TranscodeArgs = {
    inputs: [],
    out: 'dist',
    bitrate: '96k',
    formats: ['webm', 'm4a'],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--out') {
      out.out = argv[++i] ?? out.out;
    } else if (a === '--bitrate') {
      out.bitrate = argv[++i] ?? out.bitrate;
    } else if (a === '--formats') {
      const list = (argv[++i] ?? '').split(',').map((s) => s.trim());
      out.formats = list.filter((s): s is 'webm' | 'm4a' => s === 'webm' || s === 'm4a');
    } else {
      out.inputs.push(a);
    }
  }
  return out;
}

async function expandInputs(patterns: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const p of patterns) {
    const abs = resolve(p);
    const matches = await expandGlob(abs);
    out.push(...matches);
  }
  return out;
}

/**
 * Minimal glob expander — handles `dir/*.wav` and explicit files only.
 * Avoids pulling in a glob dependency for a tool that's mostly an ffmpeg loop.
 */
async function expandGlob(pattern: string): Promise<string[]> {
  if (!pattern.includes('*')) {
    try {
      const s = await stat(pattern);
      return s.isFile() ? [pattern] : [];
    } catch {
      return [];
    }
  }
  const dir = dirname(pattern);
  const base = basename(pattern);
  const re = new RegExp('^' + base.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
  try {
    const entries = await readdir(dir);
    return entries.filter((n) => re.test(n)).map((n) => join(dir, n));
  } catch {
    return [];
  }
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((res, rej) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'inherit', 'inherit'] });
    proc.on('error', rej);
    proc.on('exit', (code) => {
      if (code === 0) res();
      else rej(new Error(`ffmpeg exited with code ${code}`));
    });
  });
}
