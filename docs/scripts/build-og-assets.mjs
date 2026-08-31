/**
 * Renders the waveform strip used as the background of the home social card.
 *
 * The shape is the library's own curve maths, not a stock squiggle: an
 * equal-power crossfade between two decaying tone bursts, sampled at the
 * strip's pixel resolution. Deterministic, so the file only changes when
 * the maths does.
 *
 * PNG is written by hand — a 24-bit RGB image with a zlib-deflated scanline
 * body is about forty lines and saves pulling an encoder into the docs build.
 */
import { deflateSync } from 'node:zlib';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'src', 'assets', 'og-wave.png');

const WIDTH = 1200;
const HEIGHT = 630;
const BG = [12, 12, 16];
const WAVE = [79, 108, 247];
const WAVE_2 = [34, 211, 238];

/** Amplitude envelope at normalised position t, from the equal-power pair. */
function envelope(t) {
  const rise = Math.sin((t * Math.PI) / 2);
  const fall = Math.cos((t * Math.PI) / 2);
  // Two bursts, each decaying, crossfaded equal-power across the strip.
  const burstA = Math.exp(-6 * ((t * 3) % 1)) * fall;
  const burstB = Math.exp(-3 * ((t * 5) % 1)) * rise;
  return Math.min(1, burstA + burstB);
}

/** Sample value in [-1, 1] at normalised position t. */
function sample(t) {
  const carrier = Math.sin(t * Math.PI * 2 * 41) * 0.7 + Math.sin(t * Math.PI * 2 * 97) * 0.3;
  return envelope(t) * carrier;
}

function mix(a, b, k) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ];
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function png(width, height, pixels, alpha = false) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = alpha ? 6 : 2; // truecolour, with alpha for the app icons
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(pixels, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const stride = WIDTH * 3 + 1;
const raw = Buffer.alloc(stride * HEIGHT);
// Precompute the waveform's half-height at each column.
const halves = new Array(WIDTH);
for (let x = 0; x < WIDTH; x++) halves[x] = Math.abs(sample(x / (WIDTH - 1)));

const baseline = Math.round(HEIGHT * 0.78);
const maxHalf = HEIGHT * 0.16;

for (let y = 0; y < HEIGHT; y++) {
  const row = y * stride;
  raw[row] = 0; // filter: none
  for (let x = 0; x < WIDTH; x++) {
    const half = halves[x] * maxHalf;
    const dist = Math.abs(y - baseline);
    let color = BG;
    if (dist <= half) {
      // Colour drifts across the strip so the two bursts read as two voices.
      const k = x / (WIDTH - 1);
      const lit = mix(WAVE, WAVE_2, k);
      // Fade the fill towards the background at the crest for a soft edge.
      const soft = half > 0 ? 1 - (dist / half) ** 3 : 0;
      color = mix(BG, lit, 0.25 + 0.55 * soft);
    }
    const i = row + 1 + x * 3;
    raw[i] = color[0];
    raw[i + 1] = color[1];
    raw[i + 2] = color[2];
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, png(WIDTH, HEIGHT, raw));
console.log(`[og] wrote ${path.relative(process.cwd(), OUT)} (${fs.statSync(OUT).size} bytes)`);

/* ------------------------------------------------------------------ */
/* App icons                                                           */
/* ------------------------------------------------------------------ */

/**
 * The favicon mark: three level-meter bars on the brand violet. Drawn at 4x
 * and box-filtered down so the rounded corners and bar edges are smooth
 * without an image library.
 */
function icon(size) {
  const SS = 4;
  const n = size * SS;
  const plate = [79, 108, 247];
  const deep = [46, 60, 168];
  const ink = [255, 255, 255];
  const radius = n * 0.22;
  // Bar geometry as fractions of the canvas: x, width, height (centred).
  const bars = [
    [0.22, 0.13, 0.34],
    [0.435, 0.13, 0.62],
    [0.65, 0.13, 0.46],
  ];

  // RGB plus coverage, so the rounded corners come out transparent.
  const acc = new Float64Array(size * size * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      // Rounded-square mask.
      const dx = Math.max(radius - x, x - (n - radius), 0);
      const dy = Math.max(radius - y, y - (n - radius), 0);
      const outside = Math.hypot(dx, dy) > radius;
      let color = [0, 0, 0];
      if (!outside) {
        color = mix(plate, deep, y / n);
        for (const [bx, bw, bh] of bars) {
          const x0 = bx * n;
          const x1 = (bx + bw) * n;
          const y0 = (0.5 - bh / 2) * n;
          const y1 = (0.5 + bh / 2) * n;
          const r = (bw * n) / 2;
          const inX = x >= x0 && x <= x1;
          const capDy = Math.max(y0 + r - y, y - (y1 - r), 0);
          const capDx = Math.abs(x - (x0 + x1) / 2);
          if (inX && (capDy === 0 || Math.hypot(capDx, capDy) <= r)) color = ink;
        }
      }
      const ox = Math.floor(x / SS);
      const oy = Math.floor(y / SS);
      const i = (oy * size + ox) * 4;
      if (!outside) {
        acc[i] += color[0];
        acc[i + 1] += color[1];
        acc[i + 2] += color[2];
        acc[i + 3] += 255;
      }
    }
  }

  const iconStride = size * 4 + 1;
  const buf = Buffer.alloc(iconStride * size);
  const samples = SS * SS;
  for (let y = 0; y < size; y++) {
    buf[y * iconStride] = 0;
    for (let x = 0; x < size; x++) {
      const a = (y * size + x) * 4;
      const o = y * iconStride + 1 + x * 4;
      // Average over covered subsamples only, so edge pixels keep the plate
      // colour and lose alpha instead of darkening towards black.
      const covered = acc[a + 3] / 255;
      const div = covered > 0 ? covered : 1;
      buf[o] = Math.round(acc[a] / div);
      buf[o + 1] = Math.round(acc[a + 1] / div);
      buf[o + 2] = Math.round(acc[a + 2] / div);
      buf[o + 3] = Math.round(acc[a + 3] / samples);
    }
  }
  return png(size, size, buf, true);
}

const PUBLIC = path.join(HERE, '..', 'public');
for (const [file, size] of [
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
]) {
  const out = path.join(PUBLIC, file);
  fs.writeFileSync(out, icon(size));
  console.log(`[og] wrote public/${file}`);
}
