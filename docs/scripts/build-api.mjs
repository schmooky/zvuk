#!/usr/bin/env node
/**
 * Run TypeDoc on src/index.ts and emit a JSON file the Astro `/api/` page
 * loader reads to build per-symbol pages. Concept pages have hand-written API
 * blocks; this keeps the canonical reference always-current.
 *
 * Usage: `node scripts/build-api.mjs`
 *
 * If TypeDoc fails (e.g. typedoc not installed during a docs-only branch),
 * we write an empty manifest so the build still completes — the /api/ index
 * just renders "no entries" instead of breaking the whole site.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const ENTRY = resolve(ROOT, '../src/index.ts');
const TSCONFIG = resolve(ROOT, '../tsconfig.json');
const OUT = resolve(ROOT, 'src/content/api.json');

async function main() {
  await mkdir(dirname(OUT), { recursive: true });
  let model;
  try {
    const td = await import('typedoc');
    const app = await td.Application.bootstrapWithPlugins({
      entryPoints: [ENTRY],
      tsconfig: TSCONFIG,
      excludePrivate: true,
      excludeInternal: true,
      excludeExternals: true,
      includeVersion: true,
    });
    const project = await app.convert();
    if (!project) throw new Error('TypeDoc convert returned undefined');
    model = app.serializer.projectToObject(project, ROOT);
  } catch (e) {
    console.warn('[build-api] TypeDoc unavailable, writing empty manifest:', e?.message ?? e);
    model = { name: 'zvuk', children: [] };
  }
  await writeFile(OUT, JSON.stringify(model, null, 2), 'utf-8');
  console.log(`[build-api] Wrote ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
