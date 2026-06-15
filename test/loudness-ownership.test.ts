import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/index';

describe('loudness normalization buffer ownership', () => {
  it('does not mutate a shared (resolver-provided) buffer', async () => {
    let shared: AudioBuffer | null = null;
    const engine = createEngine({
      buses: { sfx: {} },
      resolveAsset: (): AudioBuffer => {
        // Quiet buffer (RMS 0.01, well below the 0.1 target) so a gain ≠ 1 is
        // applied, and one the caller still holds a reference to.
        const buf: AudioBuffer = engine.context.createBuffer(1, 16, 44100);
        buf.getChannelData(0).fill(0.01);
        shared = buf;
        return buf;
      },
    });
    await engine.unlock();

    await engine.loadSound('s', 'mock://s.webm', { bus: 'sfx', normalize: true });

    // Normalization scaled a fresh copy (gain ≈ 10), leaving the shared buffer
    // untouched at 0.01 — previously it was scaled in place to 0.1.
    expect(shared).not.toBeNull();
    expect((shared as unknown as AudioBuffer).getChannelData(0)[0]).toBeCloseTo(0.01, 6);

    await engine.close();
  });
});
