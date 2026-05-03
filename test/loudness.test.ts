import { describe, expect, it } from 'vitest';
import { applyLoudnessNormalization, computeNormalizationGain } from '../src/index';

function makeBuffer(amp: number, length = 4096): AudioBuffer {
  const ctor = (
    globalThis as unknown as { AudioBuffer: { new (a: number, b: number, c: number): AudioBuffer } }
  ).AudioBuffer;
  const buf = new ctor(2, length, 44100);
  for (let c = 0; c < 2; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < length; i++) data[i] = amp * Math.sin((2 * Math.PI * i) / 64);
  }
  return buf;
}

describe('loudness normalization', () => {
  it('boosts a quiet buffer toward target RMS', () => {
    const quiet = makeBuffer(0.02);
    const gain = computeNormalizationGain(quiet, { targetRms: 0.1, peakCeiling: 0.99 });
    expect(gain).toBeGreaterThan(1);
  });

  it('attenuates a loud buffer toward target RMS', () => {
    const loud = makeBuffer(0.8);
    const gain = computeNormalizationGain(loud, { targetRms: 0.1, peakCeiling: 0.99 });
    expect(gain).toBeLessThan(1);
  });

  it('respects peak ceiling and avoids clipping', () => {
    const loud = makeBuffer(0.95);
    const out = applyLoudnessNormalization(loud, { targetRms: 0.5, peakCeiling: 0.99 });
    let peak = 0;
    for (let c = 0; c < out.numberOfChannels; c++) {
      const d = out.getChannelData(c);
      for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]!));
    }
    expect(peak).toBeLessThanOrEqual(0.991);
  });

  it('applyLoudnessNormalization with false flag returns the buffer unchanged', () => {
    const buf = makeBuffer(0.3);
    const out = applyLoudnessNormalization(buf, false);
    expect(out).toBe(buf);
  });
});
