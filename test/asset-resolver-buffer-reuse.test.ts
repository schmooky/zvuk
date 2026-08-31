import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/index';

/**
 * decodeAudioData takes ownership of the ArrayBuffer it is handed and
 * detaches it. A resolveAsset that caches encoded bytes — the IndexedDB
 * recipe the asset-resolution guide recommends — hands the same buffer back
 * on the second hit, so the engine has to decode a copy.
 */
describe('resolveAsset ArrayBuffer reuse', () => {
  it('does not detach the caller’s ArrayBuffer', async () => {
    const bytes = new ArrayBuffer(2048);
    const engine = createEngine({
      buses: { sfx: {} },
      resolveAsset: () => bytes,
    });
    await engine.unlock();

    await engine.loadSound('one', 'mock://one.wav', { bus: 'sfx' });
    expect(bytes.byteLength).toBe(2048);

    // Second load off the same cached bytes must still work.
    await expect(engine.loadSound('two', 'mock://two.wav', { bus: 'sfx' })).resolves.toBeDefined();
    expect(bytes.byteLength).toBe(2048);
    await engine.close();
  });
});
