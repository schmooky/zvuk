#!/usr/bin/env node
/**
 * Sanity-check that pagefind's index landed in dist/. We don't actually copy
 * anything — pagefind writes to dist/pagefind/* directly when invoked with
 * `--site dist`. This script just logs whether the index exists, so a CI
 * failure pinpoints "pagefind didn't run" vs "Astro broke".
 */
import { stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const INDEX = resolve(ROOT, 'dist/pagefind/pagefind.js');

try {
  const s = await stat(INDEX);
  console.log(`[pagefind] index OK (${s.size} bytes)`);
} catch {
  console.warn('[pagefind] index missing — search will be empty in production.');
}
