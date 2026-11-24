#!/usr/bin/env node
// Lint the package as npm will see it. `pnpm pack` applies `publishConfig`
// (dist entry points, the `bin`), so both linters read the real tarball
// rather than the dev package.json, whose entries point at ./src.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'zvuk-pack-'));
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });
try {
  run('pnpm', ['pack', '--pack-destination', dir]);
  const tarball = join(dir, readdirSync(dir).find((f) => f.endsWith('.tgz')));
  run('pnpm', ['exec', 'publint', 'run', tarball, '--strict']);
  // ESM-only by design: the CommonJS resolution modes are expected to fail.
  run('pnpm', ['exec', 'attw', tarball, '--profile', 'esm-only']);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
