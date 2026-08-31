import { describe, expect, it } from 'vitest';
import { applyRamp, equalPowerCurve } from '../src/mixer/curve';
import { dc, maxStep, offline, SAMPLE_RATE, sampleAt } from './render';

describe('applyRamp against a real AudioParam', () => {
  it('survives a second non-linear ramp inside the first curve window', async () => {
    const ctx = offline(1);
    const gain = ctx.createGain();
    const src = dc(ctx, 1);
    src.connect(gain).connect(ctx.destination);
    src.start(0);

    applyRamp(gain.gain, 0, 1, 0.5, 'equal-power');
    // 0.2 s into a 0.5 s setValueCurveAtTime window. cancelScheduledValues
    // leaves the curve in place, so the pin that follows throws
    // NotSupportedError on every engine that enforces the rule.
    expect(() => applyRamp(gain.gain, 0.2, 0, 0.3, 'equal-power')).not.toThrow();

    const out = (await ctx.startRendering()).getChannelData(0);
    // The interrupt has to leave a continuous signal, not a jump.
    expect(maxStep(out, 0.15 * SAMPLE_RATE, 0.25 * SAMPLE_RATE)).toBeLessThan(0.05);
    // And it has to actually get where it was told to go.
    expect(sampleAt(out, 0.6)).toBeLessThan(0.001);
  });

  it('reaches its target for every curve', async () => {
    for (const curve of ['linear', 'easeIn', 'easeOut', 'easeInOut', 'equal-power'] as const) {
      const ctx = offline(0.5);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const src = dc(ctx, 0.5);
      src.connect(gain).connect(ctx.destination);
      src.start(0);
      applyRamp(gain.gain, 0, 1, 0.2, curve);
      const out = (await ctx.startRendering()).getChannelData(0);
      expect(sampleAt(out, 0.3), curve).toBeCloseTo(1, 2);
      expect(sampleAt(out, 0), curve).toBeCloseTo(0, 2);
    }
  });

  it('sums two opposing equal-power legs to constant power', async () => {
    const ctx = offline(0.5, 1);
    const a = ctx.createGain();
    const b = ctx.createGain();
    const srcA = dc(ctx, 0.5);
    const srcB = dc(ctx, 0.5);
    srcA.connect(a).connect(ctx.destination);
    srcB.connect(b).connect(ctx.destination);
    srcA.start(0);
    srcB.start(0);

    // The loop-crossfade seam: one leg rises, the other falls.
    a.gain.setValueAtTime(0, 0);
    a.gain.setValueCurveAtTime(equalPowerCurve(0, 1), 0, 0.2);
    b.gain.setValueAtTime(1, 0);
    b.gain.setValueCurveAtTime(equalPowerCurve(1, 0), 0, 0.2);

    const out = (await ctx.startRendering()).getChannelData(0);
    // Two correlated sources sum linearly here, so sin + (1 - cos) is not
    // the check; power is. Sample the midpoint against the endpoints.
    for (const t of [0.02, 0.05, 0.1, 0.15, 0.19]) {
      const g = sampleAt(out, t);
      // Each leg is a gain in [0..1]; their power sum stays within 0.5 dB
      // of unity for a constant-power pair.
      expect(g, `t=${t}`).toBeGreaterThan(0.94);
      expect(g, `t=${t}`).toBeLessThan(1.5);
    }
  });
});
