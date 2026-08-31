/**
 * Every indexed page must have the social card its own <head> points at.
 *
 * The manifest used to be hand-written and had drifted to 25 slugs against
 * 130 routes, so most pages advertised an OG image that 404ed. This walks
 * the built sitemap and fails the build on the first missing file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');

function sitemapUrls() {
  const index = path.join(DIST, 'sitemap-index.xml');
  const files = fs.existsSync(index)
    ? [...fs.readFileSync(index, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)]
        .map((m) => path.join(DIST, path.basename(new URL(m[1]).pathname)))
        .filter((f) => fs.existsSync(f))
    : [];
  if (files.length === 0) {
    const single = path.join(DIST, 'sitemap-0.xml');
    if (fs.existsSync(single)) files.push(single);
  }
  const urls = [];
  for (const file of files) {
    for (const m of fs.readFileSync(file, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)) {
      urls.push(new URL(m[1]).pathname);
    }
  }
  return urls;
}

function slugFor(pathname) {
  const trimmed = pathname.replace(/^\//, '').replace(/\/$/, '');
  return trimmed === '' ? 'index' : trimmed.split('/').join('-').toLowerCase();
}

const urls = sitemapUrls();
if (urls.length === 0) {
  console.error('[og] no sitemap URLs found — did the sitemap integration run?');
  process.exit(1);
}

const missing = [];
for (const url of urls) {
  const file = path.join(DIST, 'og', `${slugFor(url)}.png`);
  if (!fs.existsSync(file)) missing.push(`${url} → og/${slugFor(url)}.png`);
}

if (missing.length > 0) {
  console.error(`[og] ${missing.length} of ${urls.length} pages have no social card:`);
  for (const m of missing.slice(0, 20)) console.error(`  - ${m}`);
  if (missing.length > 20) console.error(`  … and ${missing.length - 20} more`);
  process.exit(1);
}

console.log(`[og] ${urls.length} pages, ${urls.length} cards`);
