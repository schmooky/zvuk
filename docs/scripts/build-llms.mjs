#!/usr/bin/env node
/**
 * Build the manifest backing /llms.txt.
 *
 * The route at docs/src/pages/llms.txt.ts reads docs/src/content/llms-manifest.json
 * and renders it as text/plain. This script is the manifest builder — it walks
 * the page tree, the TypeDoc dump, and the changeset list, so the agent-readable
 * index stays current without anyone updating it by hand.
 *
 * Order of operations matters: this script depends on api.json + changelog.json,
 * so build-api.mjs and build-changelog.mjs must run first (the docs prebuild
 * already chains them in that order).
 */
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PAGES = resolve(ROOT, 'src/pages');
const API_JSON = resolve(ROOT, 'src/content/api.json');
const CHANGELOG_JSON = resolve(ROOT, 'src/content/changelog.json');
const OUT = resolve(ROOT, 'src/content/llms-manifest.json');

// File-name patterns we never want in the index. Dynamic routes (`[slug].ts`)
// expand into per-symbol pages handled by the API section; the og endpoint
// emits images, not docs; llms.txt itself is the consumer of this manifest.
const SKIP = [/^\[/, /^og\b/, /^llms\.txt\.ts$/];

// How docs sub-directories should be grouped in the output. Order matters —
// it's the order sections appear in the rendered llms.txt.
const SECTIONS = [
  { id: 'intro', label: 'Docs', match: (p) => p === 'index' || p.startsWith('docs/') },
  { id: 'concepts', label: 'Concepts', match: (p) => p.startsWith('concepts/') },
  { id: 'fx', label: 'FX', match: (p) => p.startsWith('fx/') },
  { id: 'guides', label: 'Guides', match: (p) => p.startsWith('guides/') },
  { id: 'recipes', label: 'Recipes', match: (p) => p.startsWith('recipes/') },
  { id: 'playground', label: 'Playground', match: (p) => p.startsWith('playground/') },
  { id: 'project', label: 'Project', match: (p) => p === 'roadmap' || p === 'changelog' },
];

async function main() {
  const pages = await collectPages();
  const apiSymbols = await collectApiSymbols();
  const changelog = await collectChangelog();

  const grouped = SECTIONS.map((s) => ({
    id: s.id,
    label: s.label,
    items: pages.filter((p) => s.match(p.slug)),
  })).filter((g) => g.items.length > 0);

  const manifest = {
    generatedAt: new Date().toISOString(),
    sections: grouped,
    api: apiSymbols,
    changelog,
  };

  await writeFile(OUT, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
  const total = grouped.reduce((n, g) => n + g.items.length, 0) + apiSymbols.length + changelog.length;
  console.log(`[build-llms] Wrote ${total} entries to ${OUT}`);
}

async function collectPages() {
  const entries = await walk(PAGES);
  const out = [];
  for (const file of entries) {
    if (!file.endsWith('.astro')) continue;
    const rel = relative(PAGES, file);
    const base = basenameNoExt(rel);
    if (SKIP.some((re) => re.test(rel) || re.test(base))) continue;

    const raw = await readFile(file, 'utf-8');
    const meta = extractFrontmatter(raw, rel);
    if (!meta) continue;

    const slug = relToSlug(rel);
    const href = slugToHref(slug);
    out.push({ slug, href, title: meta.title, description: meta.description });
  }
  // Stable order — alpha by slug so "concepts/bus" comes before "concepts/voice".
  out.sort((a, b) => a.slug.localeCompare(b.slug));
  return out;
}

async function walk(dir) {
  const out = [];
  const items = await readdir(dir);
  for (const item of items) {
    const full = join(dir, item);
    const s = await stat(full);
    if (s.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

function basenameNoExt(p) {
  const last = p.split('/').pop() ?? p;
  return last.replace(/\.[^.]+$/, '');
}

function relToSlug(rel) {
  // `index.astro` at root → "" ; nested `index.astro` → directory slug
  const noExt = rel.replace(/\.astro$/, '');
  if (noExt === 'index') return 'index';
  return noExt.replace(/\/index$/, '');
}

function slugToHref(slug) {
  if (slug === 'index') return '/';
  return `/${slug}/`;
}

/**
 * Pull title + description out of a page's `<Docs>` or `<Base>` opening tag.
 * Handles three real-world variants:
 *   - inline:        `<Base title="X" description="Y">`
 *   - multi-line:    `<Docs\n  title="X"\n  description="Y"\n  ...>`
 *   - templated:     `<Base title={`X · ${SITE.name}`} ...>` — strips the tail.
 *
 * Returns null when no layout tag is present (e.g., dynamic routes or partials).
 */
function extractFrontmatter(raw, relPath) {
  const tagMatch = raw.match(/<(Docs|Base)\b([\s\S]*?)>/);
  if (!tagMatch) return null;
  const inside = tagMatch[2];
  const title = readAttr(inside, 'title') ?? deriveTitle(relPath);
  const description = readAttr(inside, 'description') ?? deriveDescription(relPath);
  return { title, description };
}

function deriveDescription(relPath) {
  if (relPath === 'index.astro') {
    return "Landing page — what zvuk is, what it ships, and a one-page tour of the API.";
  }
  return '';
}

function readAttr(tag, name) {
  // Quoted: title="..."
  const quoted = new RegExp(`${name}="([^"]+)"`).exec(tag);
  if (quoted) return cleanString(quoted[1]);
  // Templated: title={`...`}
  const templated = new RegExp(`${name}=\\{\`([^\`]+)\`\\}`).exec(tag);
  if (templated) return cleanTemplate(templated[1]);
  // Computed expression we can't statically resolve — bail.
  return null;
}

function cleanString(s) {
  return s.replace(/\s+/g, ' ').trim();
}

function cleanTemplate(s) {
  // Strip ` · ${SITE.name}` and similar suffixes so the index has clean titles.
  return s
    .replace(/\s*·\s*\$\{[^}]+\}\s*$/u, '')
    .replace(/\$\{[^}]+\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function deriveTitle(relPath) {
  // Root index is the landing page — give it the project name, not "Index".
  if (relPath === 'index.astro') return 'zvuk — audio engine for the web';
  const base = basenameNoExt(relPath).replace(/-/g, ' ');
  return base.replace(/\b\w/g, (c) => c.toUpperCase());
}

// TypeDoc 0.27+ emits a numeric `kind` field (a ReflectionKind bitmask) rather
// than the legacy `kindString`. We translate the common values back to a label
// so the llms.txt grouping is human-readable.
const KIND_LABELS = {
  1: 'Project',
  2: 'Module',
  4: 'Namespace',
  8: 'Enum',
  16: 'EnumMember',
  32: 'Variable',
  64: 'Function',
  128: 'Class',
  256: 'Interface',
  512: 'Constructor',
  1024: 'Property',
  2048: 'Method',
  4096: 'CallSignature',
  65536: 'TypeAlias',
  2097152: 'TypeAlias',
};

async function collectApiSymbols() {
  try {
    const raw = await readFile(API_JSON, 'utf-8');
    const json = JSON.parse(raw);
    const children = Array.isArray(json?.children) ? json.children : [];
    return children.map((c) => ({
      name: c.name,
      kind: c.kindString ?? KIND_LABELS[c.kind] ?? 'Symbol',
      summary: extractSummary(c),
      href: `/api/${c.name}/`,
    }));
  } catch (e) {
    console.warn('[build-llms] api.json not loadable:', e?.message ?? e);
    return [];
  }
}

function extractSummary(node) {
  const parts = node?.comment?.summary;
  if (!Array.isArray(parts)) return '';
  return parts
    .map((p) => p?.text ?? '')
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

async function collectChangelog() {
  try {
    const raw = await readFile(CHANGELOG_JSON, 'utf-8');
    const json = JSON.parse(raw);
    if (!Array.isArray(json)) return [];
    return json.map((entry) => ({
      id: entry.id,
      bump: entry.bump,
      title: entry.title,
    }));
  } catch (e) {
    console.warn('[build-llms] changelog.json not loadable:', e?.message ?? e);
    return [];
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
