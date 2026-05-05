import { afterEach, describe, expect, it, vi } from 'vitest';
import { type AssetResolver, createEngine } from '../src/index';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('resolveAsset', () => {
  it('returns AudioBuffer directly — no fetch', async () => {
    const fetchSpy = vi.fn(originalFetch);
    globalThis.fetch = fetchSpy as typeof fetch;

    const ctx = new AudioContext();
    const buf = ctx.createBuffer(2, 1024, 44100);

    const resolveAsset: AssetResolver = ({ name }) => {
      expect(name).toBe('coin');
      return buf;
    };

    const engine = createEngine({ buses: { sfx: {} }, resolveAsset });
    const sound = await engine.loadSound('coin', 'mock://coin.webm', { bus: 'sfx' });

    expect(sound.duration).toBe(buf.duration);
    expect(fetchSpy).not.toHaveBeenCalled();
    await engine.close();
  });

  it('decodes ArrayBuffer via the engine AudioContext', async () => {
    let fetched = 0;
    globalThis.fetch = (async () => {
      fetched += 1;
      return new Response(new ArrayBuffer(8), { status: 200 });
    }) as typeof fetch;

    const resolveAsset: AssetResolver = () => new ArrayBuffer(64);

    const engine = createEngine({ buses: { sfx: {} }, resolveAsset });
    await engine.loadSound('hit', 'mock://hit.webm', { bus: 'sfx' });

    expect(fetched).toBe(0);
    await engine.close();
  });

  it('treats string return as a URL — fetched and cached normally', async () => {
    const fetched: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      fetched.push(url);
      return new Response(new ArrayBuffer(8), { status: 200 });
    }) as typeof fetch;

    const resolveAsset: AssetResolver = ({ name }) => {
      if (name === 'coin') return 'mock://coin-resolved.webm';
      return undefined;
    };

    const engine = createEngine({ buses: { sfx: {} }, resolveAsset });
    await engine.loadSound('coin', 'mock://coin-original.webm', { bus: 'sfx' });

    expect(fetched).toContain('mock://coin-resolved.webm');
    expect(fetched).not.toContain('mock://coin-original.webm');
    await engine.close();
  });

  it('falls through to URL list when resolver returns undefined', async () => {
    const fetched: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      fetched.push(url);
      return new Response(new ArrayBuffer(8), { status: 200 });
    }) as typeof fetch;

    const resolveAsset: AssetResolver = () => undefined;

    const engine = createEngine({ buses: { sfx: {} }, resolveAsset });
    await engine.loadSound('coin', 'mock://coin.webm', { bus: 'sfx' });

    expect(fetched).toContain('mock://coin.webm');
    await engine.close();
  });

  it('falls through when resolver returns null', async () => {
    let fetched = 0;
    globalThis.fetch = (async () => {
      fetched += 1;
      return new Response(new ArrayBuffer(8), { status: 200 });
    }) as typeof fetch;

    const resolveAsset: AssetResolver = () => null;

    const engine = createEngine({ buses: { sfx: {} }, resolveAsset });
    await engine.loadSound('coin', 'mock://coin.webm', { bus: 'sfx' });

    expect(fetched).toBe(1);
    await engine.close();
  });

  it('passes name + url + signal to resolver', async () => {
    const captured: Array<{ name: string; url: unknown; hasSignal: boolean }> = [];
    const resolveAsset: AssetResolver = (ctx) => {
      captured.push({ name: ctx.name, url: ctx.url, hasSignal: !!ctx.signal });
      return undefined;
    };

    globalThis.fetch = (async () => new Response(new ArrayBuffer(8), { status: 200 })) as typeof fetch;

    const engine = createEngine({ buses: { sfx: {} }, resolveAsset });
    const ctrl = new AbortController();
    await engine.loadSound('blip', ['mock://a.webm', 'mock://a.m4a'], {
      bus: 'sfx',
      signal: ctrl.signal,
    });

    expect(captured).toHaveLength(1);
    expect(captured[0]?.name).toBe('blip');
    expect(captured[0]?.url).toEqual(['mock://a.webm', 'mock://a.m4a']);
    expect(captured[0]?.hasSignal).toBe(true);
    await engine.close();
  });

  it('mixes cached + uncached sounds without branching at the call site', async () => {
    const fetched: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      fetched.push(url);
      return new Response(new ArrayBuffer(8), { status: 200 });
    }) as typeof fetch;

    const ctx = new AudioContext();
    const cached = ctx.createBuffer(2, 1024, 44100);
    const cache = new Map<string, AudioBuffer>([['coin', cached]]);

    const resolveAsset: AssetResolver = ({ name }) => cache.get(name);

    const engine = createEngine({ buses: { sfx: {} }, resolveAsset });
    // Cached: no fetch.
    await engine.loadSound('coin', 'mock://coin.webm', { bus: 'sfx' });
    // Not cached: falls through to fetch.
    await engine.loadSound('hit', 'mock://hit.webm', { bus: 'sfx' });

    expect(fetched).toEqual(['mock://hit.webm']);
    await engine.close();
  });

  it('async resolver is awaited', async () => {
    const ctx = new AudioContext();
    const buf = ctx.createBuffer(2, 1024, 44100);

    const resolveAsset: AssetResolver = async () => {
      await new Promise((r) => setTimeout(r, 10));
      return buf;
    };

    const engine = createEngine({ buses: { sfx: {} }, resolveAsset });
    const sound = await engine.loadSound('async', 'mock://async.webm', { bus: 'sfx' });
    expect(sound.duration).toBe(buf.duration);
    await engine.close();
  });

  it('loadSprite uses the resolver too (delegates to loadSound)', async () => {
    let resolverCalls = 0;
    const ctx = new AudioContext();
    const buf = ctx.createBuffer(2, 44100, 44100);

    const resolveAsset: AssetResolver = () => {
      resolverCalls += 1;
      return buf;
    };

    const engine = createEngine({ buses: { sfx: {} }, resolveAsset });
    const sprite = await engine.loadSprite(
      'cascade',
      'mock://cascade.webm',
      { hit: { start: 0, duration: 0.2 } },
      { bus: 'sfx' },
    );

    expect(sprite.list()).toContain('hit');
    expect(resolverCalls).toBe(1);
    await engine.close();
  });
});
