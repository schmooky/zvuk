import { describe, expect, it, vi } from 'vitest';
import { createEngine, PreloadError } from '../src/index';

describe('engine.preload', () => {
  it('resolves immediately on an empty batch', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    await expect(engine.preload([])).resolves.toBeUndefined();
    await engine.close();
  });

  it('loads every item and registers them on the engine', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    const items = [
      { name: 'a', url: 'mock://a.webm', options: { bus: 'sfx' as const } },
      { name: 'b', url: 'mock://b.webm', options: { bus: 'sfx' as const } },
      { name: 'c', url: 'mock://c.webm', options: { bus: 'sfx' as const } },
    ];
    await engine.preload(items);
    expect(engine.hasSound('a')).toBe(true);
    expect(engine.hasSound('b')).toBe(true);
    expect(engine.hasSound('c')).toBe(true);
    await engine.close();
  });

  it('emits onProgress once per item with cumulative completion + final total', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    const events: Array<{ name: string; status: string; completed: number; total: number }> = [];
    await engine.preload(
      [
        { name: 'a', url: 'mock://a.webm' },
        { name: 'b', url: 'mock://b.webm' },
      ],
      {
        onProgress: (e) =>
          events.push({ name: e.name, status: e.status, completed: e.completed, total: e.total }),
      },
    );
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.total === 2)).toBe(true);
    expect(events.every((e) => e.status === 'loaded')).toBe(true);
    expect(events.map((e) => e.completed).sort()).toEqual([1, 2]);
    await engine.close();
  });

  it('settles every item before throwing PreloadError, with per-item failures', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    const realFetch = globalThis.fetch;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.includes('broken')) return new Response(null, { status: 500, statusText: 'oops' });
      return realFetch(input as RequestInfo);
    });
    const events: string[] = [];
    try {
      await expect(
        engine.preload(
          [
            { name: 'good-a', url: 'mock://good-a.webm' },
            { name: 'broken', url: 'mock://broken.webm' },
            { name: 'good-b', url: 'mock://good-b.webm' },
          ],
          { onProgress: (e) => events.push(`${e.name}:${e.status}`) },
        ),
      ).rejects.toBeInstanceOf(PreloadError);
      // Other two still completed.
      expect(engine.hasSound('good-a')).toBe(true);
      expect(engine.hasSound('good-b')).toBe(true);
      expect(engine.hasSound('broken')).toBe(false);
      // Progress fired for all three.
      expect(events).toHaveLength(3);
      expect(events).toContain('broken:failed');
    } finally {
      fetchSpy.mockRestore();
    }
    await engine.close();
  });

  it('respects concurrency cap (only N in flight at once)', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    let live = 0;
    let peak = 0;
    const realFetch = globalThis.fetch;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      live++;
      if (live > peak) peak = live;
      try {
        // Yield so the scheduler can dispatch other workers — without this
        // the await chain never lets concurrency stack up.
        await new Promise<void>((res) => setTimeout(res, 5));
        return realFetch(input as RequestInfo);
      } finally {
        live--;
      }
    });
    try {
      const items = Array.from({ length: 10 }, (_, i) => ({
        name: `n${i}`,
        url: `mock://n${i}.webm`,
      }));
      await engine.preload(items, { concurrency: 3 });
      expect(peak).toBeLessThanOrEqual(3);
      expect(peak).toBeGreaterThan(0);
    } finally {
      fetchSpy.mockRestore();
    }
    await engine.close();
  });

  it('aborts mid-batch when the supplied signal aborts', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    const ac = new AbortController();
    // Abort before invoking — every item sees an already-aborted signal.
    ac.abort();
    await expect(
      engine.preload([{ name: 'a', url: 'mock://a.webm' }], { signal: ac.signal }),
    ).rejects.toThrow();
    await engine.close();
  });
});
