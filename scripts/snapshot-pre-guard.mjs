#!/usr/bin/env node
// Changesets refuses `version --snapshot` while pre-release mode is on, which
// would break every branch snapshot during the v2 `next` cycle. Snapshots
// run on a throwaway CI checkout, so leave pre mode there (and only there).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const pre = '.changeset/pre.json';
if (existsSync(pre) && JSON.parse(readFileSync(pre, 'utf8')).mode === 'pre') {
  execFileSync('pnpm', ['exec', 'changeset', 'pre', 'exit'], { stdio: 'inherit' });
}
