import { describe, expect, it } from 'vitest';
import { applyRamp } from '../src/mixer/curve';

/**
 * Capture the Float32Array a fade of `equal-power` writes via
 * setValueCurveAtTime, so we can assert the actual gain shape.
 */
function captureCurve(from: number, to: number): Float32Array {
  let captured: Float32Array | null = null;
  let value = from;
  const param = {
    get value() {
      return value;
    },
    set value(v: number) {
      value = v;
    },
    cancelScheduledValues() {},
    setValueAtTime(v: number) {
      value = v;
    },
    linearRampToValueAtTime(v: number) {
      value = v;
    },
    setValueCurveAtTime(curve: Float32Array) {
      captured = curve;
    },
  } as unknown as AudioParam;
  applyRamp(param, 0, to, 1, 'equal-power');
  if (!captured) throw new Error('expected setValueCurveAtTime to be called');
  return captured;
}

describe('equal-power fade curve', () => {
  it('opposing legs sum to constant power (no midpoint dip)', () => {
    const up = captureCurve(0, 1); // incoming voice fades in
    const down = captureCurve(1, 0); // outgoing voice fades out
    expect(up.length).toBe(down.length);
    for (let i = 0; i < up.length; i++) {
      const power = up[i]! ** 2 + down[i]! ** 2;
      // True equal-power: sin² + cos² = 1 everywhere. The old sin²/cos²
      // implementation dipped to ~0.5 (-3 dB) at the midpoint.
      expect(power).toBeGreaterThan(0.999);
      expect(power).toBeLessThan(1.001);
    }
  });

  it('rising leg passes through ~0.707 near the midpoint, endpoints exact', () => {
    const up = captureCurve(0, 1);
    expect(up[0]).toBeCloseTo(0, 5);
    expect(up[up.length - 1]).toBeCloseTo(1, 5);
    const mid = up[Math.round((up.length - 1) / 2)]!;
    expect(mid).toBeGreaterThan(0.69);
    expect(mid).toBeLessThan(0.72);
  });
});
