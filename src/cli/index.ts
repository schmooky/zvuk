#!/usr/bin/env node
import { runGen } from './gen';
import { runTranscode } from './transcode';

const USAGE = `zvuk — audio engine CLI

Usage:
  zvuk transcode <glob>             Run the standard ffmpeg ladder (webm/opus + m4a/aac) on each input.
  zvuk gen <bank.json>              Emit a typed sound-name module from a manifest.

Options for "transcode":
  --out <dir>                       Output directory (default: dist).
  --bitrate <kbps>                  Audio bitrate, e.g. "96k" (default: 96k).
  --formats <list>                  Comma-separated formats: webm, m4a (default: webm,m4a).

Options for "gen":
  --out <file>                      Output .ts module path (default: bank.gen.ts).
`;

async function main(): Promise<void> {
  const [, , cmd, ...rest] = process.argv;
  switch (cmd) {
    case 'transcode': {
      await runTranscode(rest);
      return;
    }
    case 'gen': {
      await runGen(rest);
      return;
    }
    case '--help':
    case '-h':
    case undefined: {
      process.stdout.write(USAGE);
      return;
    }
    default: {
      process.stderr.write(`Unknown command: ${cmd}\n\n${USAGE}`);
      process.exit(1);
    }
  }
}

main().catch((e) => {
  process.stderr.write(`${(e as Error).stack ?? (e as Error).message}\n`);
  process.exit(1);
});
