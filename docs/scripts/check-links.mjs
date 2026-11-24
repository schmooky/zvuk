#!/usr/bin/env node
/**
 * Internal link check over the built site.
 *
 * Every href and src in dist/**\/*.html that points inside the site must
 * resolve to a file in dist: `/x/` to `x/index.html`, `/x` to `x`, `x.html`
 * or `x/index.html`. Fragments are checked against the ids on the target
 * page, except changelog version anchors for a release that hasn't shipped
 * (the "New in v2" markers point there ahead of time).
 *
 * External links are not fetched. Exit code 1 lists each broken link and
 * the page it is on.
 */
import { existsSync, readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const SKIP_DIRS = new Set(['_astro', 'pagefind', 'og', 'audio']);

async function htmlFiles(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) out.push(...(await htmlFiles(full)));
    } else if (e.name.endsWith('.html')) out.push(full);
  }
  return out;
}

function resolveTarget(pathname) {
  const clean = decodeURIComponent(pathname).replace(/^\//, '');
  const candidates = clean === '' || clean.endsWith('/')
    ? [path.join(clean, 'index.html')]
    : [clean, `${clean}.html`, path.join(clean, 'index.html')];
  for (const c of candidates) {
    const full = path.join(DIST, c);
    if (existsSync(full)) return full;
  }
  return null;
}

/** Same slug rule as the heading-id script in layouts/Docs.astro. */
function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';
}

const idCache = new Map();
function idsOf(file) {
  if (!idCache.has(file)) {
    const html = readFileSync(file, 'utf8');
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    // Docs pages get h2/h3 ids in the browser; derive the same ones here.
    for (const m of html.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/g)) {
      const text = m[1]
        .replace(/<a[^>]*class="since[^"]*"[^>]*>[\s\S]*?<\/a>/g, '')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      ids.add(slug(text.trim()));
    }
    idCache.set(file, ids);
  }
  return idCache.get(file);
}

const files = await htmlFiles(DIST);
const broken = [];
let checked = 0;

for (const file of files) {
  const html = readFileSync(file, 'utf8');
  const pageUrl = `/${path.relative(DIST, file).replace(/index\.html$/, '').replace(/\.html$/, '')}`;
  // Skip inline scripts and JSON-LD; they contain URLs that are not links.
  const body = html.replace(/<script[\s\S]*?<\/script>/g, '');
  for (const m of body.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    const raw = m[1].replace(/&amp;/g, '&');
    if (/^(?:[a-z]+:|\/\/|data:|mailto:|#$)/i.test(raw)) {
      if (!raw.startsWith('https://zvuk.schmooky.dev/')) continue;
    }
    let url;
    try {
      url = new URL(raw, `https://zvuk.schmooky.dev${pageUrl}`);
    } catch {
      broken.push({ page: pageUrl, link: raw, why: 'unparseable' });
      continue;
    }
    if (url.host !== 'zvuk.schmooky.dev') continue;
    checked++;
    const target = resolveTarget(url.pathname);
    if (!target) {
      broken.push({ page: pageUrl, link: raw, why: 'no such page' });
      continue;
    }
    const frag = url.hash.slice(1);
    if (frag && target.endsWith('.html') && !idsOf(target).has(decodeURIComponent(frag))) {
      // Ids added client-side (the on-this-page list) aren't in the HTML,
      // and a changelog anchor may name a release that is still upcoming.
      if (url.pathname === '/changelog/' && /^v\d+\.\d+\.\d+$/.test(frag)) continue;
      broken.push({ page: pageUrl, link: raw, why: 'missing #fragment' });
    }
  }
}

if (broken.length) {
  console.error(`[links] ${broken.length} broken internal link(s) in ${files.length} pages:`);
  for (const b of broken) console.error(`  ${b.page}  →  ${b.link}  (${b.why})`);
  process.exit(1);
}
console.log(`[links] ${checked} internal links across ${files.length} pages, none broken.`);
