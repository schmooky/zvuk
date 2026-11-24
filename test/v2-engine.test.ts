import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BusNotFoundError,
  type CacheConfig,
  createEngine,
  Ducker,
  type ResolveAssetContext,
  SpriteRegionNotFoundError,
  StreamSound,
  type VoiceCue,
} from '../src/index';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('exports (A3)', () => {
  it('CacheConfig and VoiceCue are public types', () => {
    const cache: CacheConfig = { maxBytes: 1024, maxEntries: 4 };
    const cue: VoiceCue = 'started';
    expect(createEngine({ cache })).toBeDefined();
    expect(cue).toBe('started');
  });
});

describe('sidechain config (B1)', () => {
  it('inserts a Ducker on the target bus keyed on the source bus', async () => {
    const engine = createEngine({
      buses: { vo: {}, music: { sidechain: { from: 'vo', amount: 0.6, threshold: 0.02 } } },
    });
    await engine.unlock();
    const chain = engine.bus('music').fx();
    expect(chain).toHaveLength(1);
    expect(chain[0]).toBeInstanceOf(Ducker);
    expect(engine.bus('vo').fx()).toHaveLength(0);
    await engine.close();
  });

  it('an unknown `from` bus fails loudly', async () => {
    const engine = createEngine({ buses: { music: { sidechain: { from: 'voo', amount: 0.5 } } } });
    await expect(engine.unlock()).rejects.toBeInstanceOf(BusNotFoundError);
  });
});

describe('reloading a name (B2)', () => {
  it('disposes the stream it replaces', async () => {
    const dispose = vi.spyOn(StreamSound.prototype, 'dispose');
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    const first = engine.loadStream('bgm', 'mock://a.mp3');
    engine.loadStream('bgm', 'mock://b.mp3');
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(dispose.mock.contexts[0]).toBe(first);
    await engine.close();
  });

  it('stops the live instances of music it replaces', async () => {
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    const m = await engine.loadMusic('theme', { loop: 'mock://loop.webm' });
    const live = m.play();
    await engine.loadMusic('theme', { loop: 'mock://loop2.webm' });
    await live.ended;
    expect(live.currentPart).toBe('ended');
    await engine.close();
  });
});

describe('engine.master (A1)', () => {
  it('has volume, mute and fade, and keeps the deprecated masterMeter', async () => {
    const engine = createEngine({ buses: { sfx: {} }, master: { volume: 0.8 } });
    await engine.unlock();
    const m = engine.master;
    expect(m.volume).toBeCloseTo(0.8);
    m.volume = 0.5;
    expect(m.volume).toBe(0.5);
    m.muted = true;
    expect(m.muted).toBe(true);
    await m.fadeTo(0.25, 0);
    expect(m.volume).toBe(0.25);
    m.muted = false;
    m.setLimiter({ threshold: -3 });
    expect(m.reduction).toBe(0);
    expect(engine.masterMeter()).toEqual(m.meter());
    await engine.close();
  });
});

describe('byte progress (A4)', () => {
  it('loadSound forwards onProgress, preload reports onBytes per item', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    const progress = vi.fn();
    await engine.loadSound('a', 'mock://a-progress.webm', { onProgress: progress });
    expect(progress).toHaveBeenCalled();
    expect(progress.mock.calls.at(-1)![0]).toBe(8);

    const bytes = vi.fn();
    await engine.preload([{ name: 'b', url: 'mock://b-progress.webm' }], { onBytes: bytes });
    expect(bytes).toHaveBeenCalledWith(expect.objectContaining({ name: 'b', loadedBytes: 8 }));
    await engine.close();
  });
});

describe('preload kinds (A10, B13)', () => {
  it('loads sprites, variants and music in one batch', async () => {
    const engine = createEngine({ buses: { sfx: {}, music: {} } });
    await engine.unlock();
    const onProgress = vi.fn();
    await engine.preload(
      [
        { name: 'coin', url: 'mock://coin.webm' },
        { kind: 'sprite', name: 'ui', url: 'mock://ui.webm', regions: { a: { start: 0, duration: 0.1 } } },
        { kind: 'variants', name: 'step', urls: ['mock://s1.webm', 'mock://s2.webm'] },
        { kind: 'music', name: 'theme', parts: { loop: 'mock://loop.webm' }, options: { bus: 'music' } },
      ],
      { onProgress },
    );
    expect(engine.hasSound('coin')).toBe(true);
    expect(engine.hasSprite('ui')).toBe(true);
    expect(engine.variants('step').count).toBe(2);
    expect(engine.hasMusic('theme')).toBe(true);
    expect(onProgress).toHaveBeenCalledTimes(4);
    await engine.close();
  });

  it('leaves no listeners on a batch signal that never aborts', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    const batch = new AbortController();
    const add = vi.spyOn(batch.signal, 'addEventListener');
    const remove = vi.spyOn(batch.signal, 'removeEventListener');
    const items = Array.from({ length: 6 }, (_, i) => ({
      name: `s${i}`,
      url: `mock://s${i}.webm`,
      options: { signal: new AbortController().signal },
    }));
    await engine.preload(items, { signal: batch.signal });
    const added = add.mock.calls.filter((c) => c[0] === 'abort').length;
    const removed = remove.mock.calls.filter((c) => c[0] === 'abort').length;
    expect(added).toBeGreaterThan(0);
    expect(removed).toBe(added);
    await engine.close();
  });
});

describe('engine.unload (A5)', () => {
  it('removes any kind of asset and evicts its buffers', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const engine = createEngine({ buses: { sfx: {}, music: {} } });
    await engine.unlock();
    await engine.loadSprite('ui', 'mock://ui-u.webm', { a: { start: 0, duration: 0.1 } });
    await engine.loadVariants('step', ['mock://s1-u.webm', 'mock://s2-u.webm']);
    const m = await engine.loadMusic('theme', { loop: 'mock://loop-u.webm' }, { bus: 'music' });
    engine.loadStream('bgm', 'mock://bgm-u.mp3');
    const live = m.play();

    for (const n of ['ui', 'step', 'theme', 'bgm']) engine.unload(n);
    expect(engine.hasSprite('ui')).toBe(false);
    expect(engine.hasVariants('step')).toBe(false);
    expect(engine.hasMusic('theme')).toBe(false);
    expect(engine.hasStream('bgm')).toBe(false);
    await live.ended;

    // Evicted: loading the same URL fetches again.
    const before = fetchSpy.mock.calls.length;
    await engine.loadSprite('ui', 'mock://ui-u.webm', { a: { start: 0, duration: 0.1 } });
    expect(fetchSpy.mock.calls.length).toBe(before + 1);
    engine.unload('nothing-here');
    await engine.close();
  });
});

describe('resolver context (A6)', () => {
  it('passes the public name with kind and part', async () => {
    const seen: Omit<ResolveAssetContext, 'signal'>[] = [];
    const engine = createEngine({
      buses: { sfx: {} },
      resolveAsset: ({ name, kind, part, url }) => {
        seen.push({ name, kind, part, url });
        return undefined;
      },
    });
    await engine.unlock();
    await engine.loadSound('coin', 'mock://coin-r.webm');
    await engine.loadSprite('ui', 'mock://ui-r.webm', { a: { start: 0, duration: 0.1 } });
    await engine.loadVariants('step', ['mock://s1-r.webm', 'mock://s2-r.webm']);
    await engine.loadMusic('theme', { intro: 'mock://i-r.webm', loop: 'mock://l-r.webm' });
    expect(seen).toEqual(
      expect.arrayContaining([
        { name: 'coin', kind: 'sound', part: undefined, url: 'mock://coin-r.webm' },
        { name: 'ui', kind: 'sprite', part: undefined, url: 'mock://ui-r.webm' },
        { name: 'step', kind: 'variants', part: 0, url: 'mock://s1-r.webm' },
        { name: 'step', kind: 'variants', part: 1, url: 'mock://s2-r.webm' },
        { name: 'theme', kind: 'music', part: 'intro', url: 'mock://i-r.webm' },
        { name: 'theme', kind: 'music', part: 'loop', url: 'mock://l-r.webm' },
      ]),
    );
    expect(seen.some((c) => c.name.startsWith('__'))).toBe(false);
    await engine.close();
  });
});

describe('app suspend (B11)', () => {
  it('survives a tab hide and return; resume() brings audio back', async () => {
    vi.useFakeTimers();
    let visibility: DocumentVisibilityState = 'visible';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    const ctx = engine.context as AudioContext & { _setState: (s: string) => void };
    const suspend = vi.spyOn(ctx, 'suspend').mockImplementation(async () => ctx._setState('suspended'));
    const resume = vi.spyOn(ctx, 'resume').mockImplementation(async () => ctx._setState('running'));

    await engine.suspend();
    expect(engine.state).toBe('suspended');
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(300);
    expect(resume).not.toHaveBeenCalled();
    expect(engine.state).toBe('suspended');

    await engine.resume();
    expect(engine.state).toBe('live');
    expect(suspend).toHaveBeenCalled();
    await engine.close();
    delete (document as unknown as { visibilityState?: unknown }).visibilityState;
  });
});

describe('sprite regions (B14)', () => {
  it('rejects regions outside the buffer and registers nothing', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    await expect(
      engine.loadSprite('bad', 'mock://bad.webm', { late: { start: 0.9, duration: 0.5 } }),
    ).rejects.toBeInstanceOf(RangeError);
    expect(engine.hasSprite('bad')).toBe(false);
    await engine.close();
  });

  it('names the sprite and its regions when a region is missing', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    const sp = await engine.loadSprite('ui', 'mock://ui-m.webm', { click: { start: 0, duration: 0.1 } });
    expect(() => sp.play('clik')).toThrow(SpriteRegionNotFoundError);
    expect(() => sp.play('clik')).toThrow(/Sprite "ui" has no region "clik". Regions: "click"/);
    await engine.close();
  });
});
