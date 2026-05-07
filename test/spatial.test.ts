import { describe, expect, it } from 'vitest';
import { Spatializer } from '../src/index';

describe('Spatializer 3D config', () => {
  it('honours refDistance / maxDistance / rolloffFactor / distanceModel from SpatialOptions', async () => {
    const ctx = new AudioContext();
    const sp = new Spatializer(ctx, {
      position: [1, 0, 2],
      refDistance: 5,
      maxDistance: 250,
      rolloffFactor: 1.5,
      distanceModel: 'exponential',
    });
    // Verify by reading the inner panner state through the stub that
    // connectInto returns the input node.
    const dest = ctx.createGain();
    const input = sp.connectInto(dest);
    const panner = input as unknown as PannerNode;
    expect(panner.refDistance).toBe(5);
    expect(panner.maxDistance).toBe(250);
    expect(panner.rolloffFactor).toBe(1.5);
    expect(panner.distanceModel).toBe('exponential');
    sp.dispose();
    await ctx.close();
  });

  it('defaults match Web Audio sensible values when SpatialOptions omits 3D config', async () => {
    const ctx = new AudioContext();
    const sp = new Spatializer(ctx, { position: [0, 0, 0] });
    const dest = ctx.createGain();
    const panner = sp.connectInto(dest) as unknown as PannerNode;
    expect(panner.refDistance).toBe(1);
    expect(panner.maxDistance).toBe(10000);
    expect(panner.rolloffFactor).toBe(1);
    expect(panner.distanceModel).toBe('inverse');
    sp.dispose();
    await ctx.close();
  });

  it('live setters update the underlying PannerNode params', async () => {
    const ctx = new AudioContext();
    const sp = new Spatializer(ctx, { position: [0, 0, 0] });
    const dest = ctx.createGain();
    const panner = sp.connectInto(dest) as unknown as PannerNode;
    sp.setRefDistance(7);
    sp.setMaxDistance(500);
    sp.setRolloffFactor(2);
    sp.setDistanceModel('linear');
    expect(panner.refDistance).toBe(7);
    expect(panner.maxDistance).toBe(500);
    expect(panner.rolloffFactor).toBe(2);
    expect(panner.distanceModel).toBe('linear');
    sp.dispose();
    await ctx.close();
  });

  it('setOcclusion is a no-op on 2D spatializers (does not throw)', async () => {
    const ctx = new AudioContext();
    const sp = new Spatializer(ctx, { pan: 0.5 });
    expect(() => sp.setOcclusion(1)).not.toThrow();
    sp.dispose();
    await ctx.close();
  });

  it('setOcclusion(0) leaves filter cutoff at 22050; setOcclusion(1) drops it toward 500', async () => {
    const ctx = new AudioContext();
    const sp = new Spatializer(ctx, { position: [0, 0, 0] });
    sp.setOcclusion(0);
    // Reach into the internals to read the filter — fine for a unit test.
    const filter = (sp as unknown as { occlusionFilter: BiquadFilterNode | null }).occlusionFilter;
    expect(filter).not.toBeNull();
    if (filter) {
      expect(filter.frequency.value).toBeCloseTo(22050, -1);
    }
    sp.setOcclusion(1);
    if (filter) {
      // Logarithmic interp lands at exactly 500 at amount=1.
      expect(filter.frequency.value).toBeCloseTo(500, 0);
    }
    sp.dispose();
    await ctx.close();
  });
});
