#!/usr/bin/env node
import { version } from '../../package.json';
import { runGen } from './gen';
import { runTranscode } from './transcode';

const USAGE = `zvuk — audio engine CLI

Usage:
  zvuk transcode <glob>             Run the standard ffmpeg ladder (webm/opus + m4a/aac) on each input.
  zvuk gen <bank.json>              Emit a typed sound-name module from a manifest.
  zvuk --version                    Print the version.

Options for "transcode":
  --out <dir>                       Output directory (default: dist). Inputs from several
                                    folders keep their layout under it.
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
    case '--version':
    case '-v': {
      process.stdout.write(`${version}\n`);
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
  // A user error reads better without a stack; set ZVUK_DEBUG=1 for one.
  const err = e as Error;
  process.stderr.write(`${process.env.ZVUK_DEBUG ? (err.stack ?? err.message) : err.message}\n`);
  process.exit(1);
});
