import { describe, expect, it } from 'vitest';
import { StretchProcessor } from '../src/index';

function sine(n: number, freq = 440, rate = 44100): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.sin((2 * Math.PI * freq * i) / rate);
  return out;
}

function rms(a: Float32Array, from = 0, to = a.length): number {
  let s = 0;
  for (let i = from; i < to; i++) s += a[i]! * a[i]!;
  return Math.sqrt(s / Math.max(1, to - from));
}

describe('StretchProcessor (T5)', () => {
  it('factor 1 returns a copy', () => {
    const input = sine(1000);
    const out = new StretchProcessor(1).process(input);
    expect(out).not.toBe(input);
    expect(Array.from(out)).toEqual(Array.from(input));
  });

  it('shortens by the factor and keeps the level', () => {
    const input = sine(44100);
    for (const f of [1.25, 1.5, 2, 3]) {
      const out = new StretchProcessor(f).process(input);
      expect(out.length).toBe(Math.floor(input.length / f));
      // Body of the output (the overlap-add tail can be short of a grain).
      const body = rms(out, 0, Math.floor(out.length * 0.8));
      expect(body).toBeGreaterThan(rms(input) * 0.6);
      expect(body).toBeLessThan(rms(input) * 1.4);
      expect(out.every((v) => Number.isFinite(v))).toBe(true);
    }
  });

  it('handles input shorter than a grain', () => {
    const out = new StretchProcessor(2).process(sine(100));
    expect(out.length).toBe(50);
  });
});
