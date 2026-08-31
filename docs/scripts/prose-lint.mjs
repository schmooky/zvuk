#!/usr/bin/env node
/**
 * Prose linter for the docs corpus.
 *
 * Runs on the Markdown twins the build already produces, so it sees the same
 * words a reader does — components rendered, code fenced and skippable.
 *
 * It exists because of one measurement: across 576 prose sentences the site
 * used 174 em-dashes and 30 colon-appositives. That is 204 sentences — 35% —
 * built as "assert, then restate". The vocabulary was fine; the rhythm was
 * the tell, and cutting only em-dashes just moves the tic into colons.
 *
 * Thresholds are ratios, not counts, so a long page is allowed more than a
 * short one. Sentence-length sigma is reported, not enforced: it's a hint
 * that every sentence is the same length.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

/** One prose em-dash (or colon-appositive) per this many sentences. */
const SENTENCES_PER_DASH = 40;
/** Warn when sentence lengths cluster this tightly (words). */
const MIN_SIGMA = 5;

/**
 * Words that read as generated rather than written. Warnings only — a real
 * use ("we leverage the browser's own decoder") shouldn't fail a build.
 */
const BANNED = [
  'seamless',
  'seamlessly',
  'leverage',
  'leverages',
  'delve',
  'robust',
  'cutting-edge',
  'game-changer',
  'unlock the power',
  'in today\'s',
  'it is important to note',
  'best-in-class',
  'effortlessly',
  'plethora',
  'realm of',
];

/** Generated pages aren't hand-written prose; don't hold them to this. */
const SKIP = [/^api\//, /^api\.md$/, /^changelog\.md$/, /^llms-full/];

async function walk(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['og', '_astro', 'pagefind', 'audio'].includes(entry.name)) continue;
      out.push(...(await walk(full)));
    } else if (entry.name.endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

/** Strip fenced code, inline code, links-as-URLs and headings. */
function proseOf(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/^\s{4,}\S.*$/gm, ' ')
    .replace(/^#{1,6}\s.*$/gm, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\|/g, ' ');
}

function sentencesOf(prose) {
  return prose
    .split(/(?<=[.!?])\s+(?=[A-Z"'(`])|\n{2,}/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.split(' ').length >= 3);
}

/**
 * A colon used to restate: a colon followed by a lowercase word, which is
 * the appositive shape ("it does one thing: it ramps"). Colons introducing
 * a list or a code block are left alone.
 */
function colonAppositives(sentences) {
  return sentences.filter((s) => /\w:\s+[a-z]/.test(s)).length;
}

function emDashes(sentences) {
  return sentences.reduce((n, s) => n + (s.match(/—/g)?.length ?? 0), 0);
}

function sigma(sentences) {
  if (sentences.length < 2) return 0;
  const lengths = sentences.map((s) => s.split(' ').length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / lengths.length;
  return Math.sqrt(variance);
}

const files = (await walk(DIST)).sort();
const rows = [];
let failures = 0;
let warnings = 0;

for (const file of files) {
  const rel = path.relative(DIST, file);
  if (SKIP.some((re) => re.test(rel))) continue;

  const markdown = await fs.readFile(file, 'utf8');
  const sentences = sentencesOf(proseOf(markdown));
  if (sentences.length === 0) continue;

  const dashes = emDashes(sentences);
  const colons = colonAppositives(sentences);
  const allowed = Math.max(1, Math.floor(sentences.length / SENTENCES_PER_DASH));
  const sd = sigma(sentences);
  const banned = BANNED.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(markdown));

  const problems = [];
  if (dashes > allowed) problems.push(`${dashes} em-dashes (max ${allowed} for ${sentences.length} sentences)`);
  if (colons > allowed) problems.push(`${colons} colon-appositives (max ${allowed})`);
  if (problems.length > 0) failures++;

  const notes = [];
  if (sd < MIN_SIGMA) notes.push(`sentence-length sigma ${sd.toFixed(1)}`);
  if (banned.length > 0) notes.push(`banned: ${banned.join(', ')}`);
  if (notes.length > 0) warnings++;

  rows.push({ rel, sentences: sentences.length, dashes, colons, sd, problems, notes });
}

const width = Math.max(...rows.map((r) => r.rel.length), 10);
for (const r of rows) {
  const status = r.problems.length > 0 ? 'FAIL' : r.notes.length > 0 ? 'warn' : 'ok  ';
  const line = `${status}  ${r.rel.padEnd(width)}  ${String(r.sentences).padStart(4)} sent  ${String(r.dashes).padStart(3)} dash  ${String(r.colons).padStart(3)} colon  sigma ${r.sd.toFixed(1).padStart(5)}`;
  if (r.problems.length > 0 || r.notes.length > 0) {
    console.log(line);
    for (const p of r.problems) console.log(`      ${p}`);
    for (const n of r.notes) console.log(`      note: ${n}`);
  } else if (process.env.PROSE_LINT_VERBOSE) {
    console.log(line);
  }
}

const totalSentences = rows.reduce((n, r) => n + r.sentences, 0);
const totalDashes = rows.reduce((n, r) => n + r.dashes, 0);
const totalColons = rows.reduce((n, r) => n + r.colons, 0);
console.log(
  `\n[prose] ${rows.length} pages, ${totalSentences} sentences, ${totalDashes} em-dashes, ${totalColons} colon-appositives`,
);

if (failures > 0) {
  console.error(`[prose] ${failures} page(s) over the ratio. See docs/STYLE.md.`);
  process.exit(1);
}
console.log(`[prose] all pages within budget${warnings > 0 ? `, ${warnings} with notes` : ''}`);
