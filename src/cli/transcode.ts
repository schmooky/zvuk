import { spawn } from 'node:child_process';
import { mkdir, readdir, stat } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';

export const FORMATS = ['webm', 'm4a'] as const;
export type Format = (typeof FORMATS)[number];

export interface TranscodeArgs {
  inputs: string[];
  out: string;
  bitrate: string;
  formats: Format[];
}

/**
 * The asset-formats guide ffmpeg loop, packaged. For each input file produces:
 *   <name>.webm  (libopus)   — small, plays everywhere except old iOS Safari.
 *   <name>.m4a   (aac)       — fallback for the codec ladder.
 *
 * Requires ffmpeg on PATH. The CLI is a thin wrapper — we don't bundle ffmpeg.
 */
export async function runTranscode(argv: string[]): Promise<void> {
  const args = parseTranscodeArgs(argv);
  const expanded = await expandInputs(args.inputs);
  if (expanded.length === 0) {
    throw new Error('No input files matched.');
  }
  for (const job of planOutputs(expanded, args.out, args.formats)) {
    await mkdir(dirname(job.target), { recursive: true });
    const codecArgs =
      job.format === 'webm'
        ? ['-c:a', 'libopus', '-b:a', args.bitrate, '-vn']
        : ['-c:a', 'aac', '-b:a', args.bitrate, '-vn'];
    await runFfmpeg(['-y', '-i', job.input, ...codecArgs, job.target]);
    process.stdout.write(`  → ${job.target}\n`);
  }
}

export interface TranscodeJob {
  input: string;
  format: Format;
  target: string;
}

/**
 * Where each output goes. Inputs keep their folder layout relative to the
 * deepest folder they share, so `sfx/hit.wav` and `ui/hit.wav` become
 * `out/sfx/hit.webm` and `out/ui/hit.webm`. v1 flattened every input into
 * `out/`, and the second `hit` overwrote the first.
 */
export function planOutputs(
  inputs: readonly string[],
  out: string,
  formats: readonly Format[],
): TranscodeJob[] {
  const abs = inputs.map((i) => resolve(i));
  const root = commonDir(abs.map((i) => dirname(i)));
  const jobs: TranscodeJob[] = [];
  const targets = new Set<string>();
  for (const input of abs) {
    const rel = relative(root, dirname(input));
    const name = basename(input, extname(input));
    for (const format of formats) {
      const target = join(out, rel, `${name}.${format}`);
      if (targets.has(target)) {
        throw new Error(`Two inputs would both write ${target}. Rename one of them.`);
      }
      targets.add(target);
      jobs.push({ input, format, target });
    }
  }
  return jobs;
}

function commonDir(dirs: readonly string[]): string {
  if (dirs.length === 0) return '';
  const split = dirs.map((d) => d.split(sep));
  const first = split[0]!;
  let n = first.length;
  for (const parts of split) {
    let i = 0;
    while (i < n && parts[i] === first[i]) i++;
    n = i;
  }
  return first.slice(0, n).join(sep) || sep;
}

export function parseTranscodeArgs(argv: string[]): TranscodeArgs {
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
      const list = (argv[++i] ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const unknown = list.filter((s) => !(FORMATS as readonly string[]).includes(s));
      // v1 dropped unknown names and, with none left, did nothing at all.
      if (unknown.length > 0 || list.length === 0) {
        throw new Error(
          `--formats takes a comma-separated list of: ${FORMATS.join(', ')}. Got "${argv[i] ?? ''}".`,
        );
      }
      out.formats = list as Format[];
    } else if (a.startsWith('--')) {
      throw new Error(`Unknown option for transcode: ${a}`);
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
  const re = new RegExp(`^${base.replace(/\./g, '\\.').replace(/\*/g, '.*')}$`);
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
