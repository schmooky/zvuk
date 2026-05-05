import { afterEach, describe, expect, it, vi } from 'vitest';
import { AggregateDecodeError, createEngine, DecodeError } from '../src/index';

// Each test installs its own fetch stub. We restore the original (the
// happy-path setup.ts mock) in afterEach so unrelated tests aren't affected.
const originalFetch = globalThis.fetch;

function installFetch(handler: (url: string) => Promise<Response>): void {
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    return handler(url);
  }) as typeof fetch;
}

describe('codec network fallback', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('falls through to next URL on 404', async () => {
    const fetched: string[] = [];
    installFetch(async (url) => {
      fetched.push(url);
      if (url.endsWith('.webm')) return new Response('', { status: 404 });
      return new Response(new ArrayBuffer(8), { status: 200 });
    });

    const engine = createEngine({ buses: { sfx: {} } });
    const sound = await engine.loadSound('coin', ['mock://coin.webm', 'mock://coin.m4a'], { bus: 'sfx' });

    expect(sound.name).toBe('coin');
    expect(fetched).toContain('mock://coin.webm');
    expect(fetched).toContain('mock://coin.m4a');
    await engine.close();
  });

  it('falls through on network error (rejected fetch)', async () => {
    installFetch(async (url) => {
      if (url.endsWith('.webm')) throw new TypeError('Failed to fetch');
      return new Response(new ArrayBuffer(8), { status: 200 });
    });

    const engine = createEngine({ buses: { sfx: {} } });
    const sound = await engine.loadSound('hit', ['mock://hit.webm', 'mock://hit.m4a'], { bus: 'sfx' });
    expect(sound.name).toBe('hit');
    await engine.close();
  });

  it('falls through on decode failure', async () => {
    installFetch(async () => new Response(new ArrayBuffer(8), { status: 200 }));

    const engine = createEngine({ buses: { sfx: {} } });
    const ctx = engine.context as unknown as {
      decodeAudioData: (data: ArrayBuffer) => Promise<AudioBuffer>;
    };
    const realDecode = ctx.decodeAudioData.bind(ctx);
    let calls = 0;
    ctx.decodeAudioData = vi.fn(async (data: ArrayBuffer) => {
      calls += 1;
      if (calls === 1) throw new Error('bad codec');
      return realDecode(data);
    });

    const sound = await engine.loadSound('blip', ['mock://blip.webm', 'mock://blip.m4a'], { bus: 'sfx' });
    expect(sound.name).toBe('blip');
    expect(calls).toBe(2);
    await engine.close();
  });

  it('throws AggregateDecodeError when all URLs fail', async () => {
    installFetch(async () => new Response('', { status: 500 }));

    const engine = createEngine({ buses: { sfx: {} } });

    let caught: unknown;
    try {
      await engine.loadSound('miss', ['mock://a.webm', 'mock://a.m4a'], { bus: 'sfx' });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(AggregateDecodeError);
    expect(caught).toBeInstanceOf(DecodeError);
    const agg = caught as AggregateDecodeError;
    expect(agg.attempts).toHaveLength(2);
    expect(agg.attempts[0]?.url).toBe('mock://a.webm');
    expect(agg.attempts[1]?.url).toBe('mock://a.m4a');
    expect(agg.message).toContain('mock://a.webm');
    expect(agg.message).toContain('mock://a.m4a');
    await engine.close();
  });

  it('rethrows DecodeError verbatim for single-URL failure', async () => {
    installFetch(async () => new Response('', { status: 404 }));

    const engine = createEngine({ buses: { sfx: {} } });

    let caught: unknown;
    try {
      await engine.loadSound('only', 'mock://only.webm', { bus: 'sfx' });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(DecodeError);
    expect(caught).not.toBeInstanceOf(AggregateDecodeError);
    await engine.close();
  });

  it('AbortError is fatal — does not try fallbacks', async () => {
    let fetchCount = 0;
    installFetch(async (_url) => {
      fetchCount += 1;
      const err = new Error('aborted');
      err.name = 'AbortError';
      throw err;
    });

    const engine = createEngine({ buses: { sfx: {} } });
    const ctrl = new AbortController();

    const p = engine.loadSound('x', ['mock://x.webm', 'mock://x.m4a'], {
      bus: 'sfx',
      signal: ctrl.signal,
    });

    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchCount).toBe(1);
    await engine.close();
  });

  it('cache fast-path: returns any cached URL without re-fetching', async () => {
    let fetchCount = 0;
    installFetch(async () => {
      fetchCount += 1;
      return new Response(new ArrayBuffer(8), { status: 200 });
    });

    const engine = createEngine({ buses: { sfx: {} } });
    await engine.loadSound('a', ['mock://a.m4a'], { bus: 'sfx' });
    expect(fetchCount).toBe(1);

    // Re-load with the m4a as fallback; webm shouldn't be fetched because
    // m4a is already cached.
    engine.removeSound('a');
    await engine.loadSound('a', ['mock://a.webm', 'mock://a.m4a'], { bus: 'sfx' });
    expect(fetchCount).toBe(1);
    await engine.close();
  });
});
