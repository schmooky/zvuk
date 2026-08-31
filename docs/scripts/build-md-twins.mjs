#!/usr/bin/env node
/**
 * Markdown twins + /llms-full.txt.
 *
 * llms.txt is an index: it tells an agent what pages exist. It doesn't carry
 * the prose, so anything reading it still has to fetch and strip HTML. This
 * writes a Markdown copy of every page next to it (`/concepts/bus.md`) and a
 * single concatenated corpus at `/llms-full.txt`.
 *
 * Runs on the built output rather than the sources, so components, code
 * samples and generated API pages are all included as rendered.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import TurndownService from 'turndown';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PKG = JSON.parse(await fs.readFile(path.join(ROOT, '..', 'package.json'), 'utf8'));
const SITE_URL = 'https://zvuk.schmooky.dev';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});
// Canvas visualisers and interactive demo shells carry no text worth
// extracting; keep their captions, drop the widget chrome.
turndown.remove(['script', 'style', 'canvas', 'svg', 'noscript', 'nav', 'aside']);

async function walk(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'og' || entry.name === '_astro' || entry.name === 'pagefind') continue;
      out.push(...(await walk(full)));
    } else if (entry.name === 'index.html') {
      out.push(full);
    }
  }
  return out;
}

/** Route for a built file: dist/concepts/bus/index.html → /concepts/bus/ */
function routeOf(file) {
  const rel = path.relative(DIST, file).replace(/index\.html$/, '');
  return `/${rel}`.replace(/\/+/g, '/');
}

/**
 * Prefer the <article> the docs layout wraps its prose in; the sidebar lives
 * inside <main> alongside it, and repeating the whole nav at the top of 122
 * files helps nobody.
 */
function extract(html) {
  const article = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  if (article) return article[1];
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  return main ? main[1] : '';
}

function metaOf(html, name) {
  const m =
    html.match(new RegExp(`<meta\\s+name="${name}"\\s+content="([^"]*)"`, 'i')) ??
    html.match(new RegExp(`<meta\\s+property="${name}"\\s+content="([^"]*)"`, 'i'));
  return m ? decode(m[1]) : '';
}

function titleOf(html) {
  const m = html.match(/<title>([^<]*)<\/title>/i);
  return m ? decode(m[1]) : '';
}

function decode(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

const files = (await walk(DIST)).sort();
const docs = [];

for (const file of files) {
  const html = await fs.readFile(file, 'utf8');
  // The pop-out mixer is a tool, not a document.
  if (/<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html)) continue;

  const route = routeOf(file);
  const body = turndown.turndown(extract(html)).replace(/\n{3,}/g, '\n\n').trim();
  if (!body) continue;

  const header = [
    `# ${titleOf(html)}`,
    '',
    `zvuk v${PKG.version} · MIT · ${SITE_URL}${route}`,
    '',
    metaOf(html, 'description'),
    '',
  ].join('\n');

  const markdown = `${header}\n${body}\n`;
  // /concepts/bus/ → dist/concepts/bus.md ; / → dist/index.md
  const slug = route === '/' ? 'index' : route.replace(/^\/|\/$/g, '');
  const out = path.join(DIST, `${slug}.md`);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, markdown, 'utf8');
  docs.push({ route, markdown });
}

const corpus = [
  `# zvuk v${PKG.version} — full documentation`,
  '',
  '> Every page of https://zvuk.schmooky.dev as one Markdown document.',
  '> Generated at build time; the per-page copies live alongside each route',
  '> (for example /concepts/bus.md).',
  '',
  ...docs.flatMap((d) => ['---', '', `<!-- ${SITE_URL}${d.route} -->`, '', d.markdown, '']),
].join('\n');

await fs.writeFile(path.join(DIST, 'llms-full.txt'), corpus, 'utf8');
console.log(`[llms] ${docs.length} markdown twins, llms-full.txt ${(corpus.length / 1024).toFixed(0)} kB`);
