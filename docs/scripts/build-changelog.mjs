#!/usr/bin/env node
/**
 * Read .changeset/*.md (excluding README + config.json) and emit a single
 * JSON manifest the /changelog/ Astro page renders. Keeps changelog
 * front-of-house and removes the "open the repo to find out what changed"
 * step.
 *
 * Each entry is:
 *   { id, bump: 'major'|'minor'|'patch', title, body }
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CHANGESET_DIR = resolve(ROOT, '../.changeset');
const OUT = resolve(ROOT, 'src/content/changelog.json');

async function main() {
  await mkdir(dirname(OUT), { recursive: true });
  let entries = [];
  try {
    const files = await readdir(CHANGESET_DIR);
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      if (file === 'README.md') continue;
      const raw = await readFile(join(CHANGESET_DIR, file), 'utf-8');
      const parsed = parse(raw);
      if (!parsed) continue;
      entries.push({ id: file.replace(/\.md$/, ''), ...parsed });
    }
  } catch (e) {
    console.warn('[build-changelog] no .changeset directory found:', e?.message ?? e);
  }
  // Newest first by filename — changesets use random adjective-noun-number
  // names so name order isn't temporal, but reverse-sorted at least keeps
  // the same file at the top across builds until edited.
  entries.sort((a, b) => (a.id < b.id ? 1 : -1));
  await writeFile(OUT, JSON.stringify(entries, null, 2), 'utf-8');
  console.log(`[build-changelog] Wrote ${entries.length} entries to ${OUT}`);
}

function parse(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return null;
  const fm = m[1];
  const body = m[2].trim();
  const bumps = [...fm.matchAll(/'([^']+)':\s*(major|minor|patch)/g)];
  if (bumps.length === 0) return null;
  const bump = bumps[0][2];
  // First non-bullet, non-list paragraph as the title; strip trailing
  // colons and markdown heading markers so the changelog page doesn't show
  // "Sweeps the public roadmap (Tiers 1–4) end-to-end:" as a title.
  const lines = body.split('\n');
  let title = 'change';
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('-') || trimmed.startsWith('*')) continue;
    title = trimmed.replace(/^#+\s*/, '').replace(/[:.]$/, '');
    break;
  }
  return { bump, title, body };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
