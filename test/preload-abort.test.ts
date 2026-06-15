import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/index';

describe('preload abort', () => {
  it('aborting mid-batch halts further loads and rejects', async () => {
    const ac = new AbortController();
    const engine = createEngine({
      buses: { sfx: {} },
      // Abort the batch while the first item is resolving. In a real browser
      // the combined per-item signal also aborts the in-flight fetch; here the
      // remaining items are stopped by the per-iteration aborted-signal check.
      resolveAsset: ({ name }): undefined => {
        if (name === 'a') ac.abort();
        return undefined;
      },
    });
    await engine.unlock();

    await expect(
      engine.preload(
        [
          { name: 'a', url: 'mock://a.webm', options: { bus: 'sfx' as const } },
          { name: 'b', url: 'mock://b.webm', options: { bus: 'sfx' as const } },
          { name: 'c', url: 'mock://c.webm', options: { bus: 'sfx' as const } },
        ],
        { signal: ac.signal, concurrency: 1 },
      ),
    ).rejects.toThrow();

    // With concurrency 1 the worker stops at the abort and never pulls b/c.
    expect(engine.hasSound('b')).toBe(false);
    expect(engine.hasSound('c')).toBe(false);

    await engine.close();
  });
});
