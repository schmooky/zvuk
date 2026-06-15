import { describe, expect, it } from 'vitest';
import { equalPowerCurve } from '../src/mixer/curve';

// equalPowerCurve drives the scheduled loop-crossfade segment gains
// (voice + music). Two overlapping legs must sum to constant power.
describe('equalPowerCurve (loop-crossfade legs)', () => {
  it('rising + falling legs sum to constant power, endpoints exact', () => {
    const up = equalPowerCurve(0, 1);
    const down = equalPowerCurve(1, 0);
    expect(up.length).toBe(down.length);
    for (let i = 0; i < up.length; i++) {
      const power = up[i]! ** 2 + down[i]! ** 2;
      expect(power).toBeGreaterThan(0.999);
      expect(power).toBeLessThan(1.001);
    }
    expect(up[0]).toBeCloseTo(0, 6);
    expect(up[up.length - 1]).toBeCloseTo(1, 6);
    expect(down[0]).toBeCloseTo(1, 6);
    expect(down[down.length - 1]).toBeCloseTo(0, 6);
  });
});
