import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEngine } from '../src/index';

type FakeSource = {
  _startArgs: { when?: number; offset?: number; duration?: number } | null;
  _connections: { gain: { events: { kind: string; time: number; value: number }[] } }[];
  loop: boolean;
};

let spy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.useFakeTimers();
  spy = vi.spyOn(AudioContext.prototype, 'createBufferSource');
});
afterEach(() => {
  spy.mockRestore();
  vi.useRealTimers();
});

const sources = (): FakeSource[] => spy.mock.results.map((r) => r.value as unknown as FakeSource);

describe('loop crossfade at pitch != 1 (B3)', () => {
  it('sizes the envelope and the next seam in output seconds', async () => {
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    await engine.loadSound('bed', 'mock://bed.webm', { bus: 'music' });
    const before = spy.mock.calls.length;
    const t0 = engine.now;
    const v = engine.sound('bed').play({ loop: true, loopCrossfade: 0.05, pitch: 2 });

    const first = sources()[before]!;
    // 1 s of buffer at rate 2 is 0.5 s of output.
    expect(first._startArgs?.duration).toBeCloseTo(1, 5);
    const segGain = first._connections[0]!.gain;
    const fadeOut = segGain.events.filter((e) => e.kind === 'curve').at(-1)!;
    expect(fadeOut.time - t0).toBeCloseTo(0.45, 2);

    // The next segment is armed for 0.45 s of output, not 0.95 s.
    vi.advanceTimersByTime(460);
    const second = sources()[before + 1];
    expect(second).toBeDefined();
    expect((second!._startArgs?.when ?? 0) - t0).toBeCloseTo(0.45, 2);
    v.stop({ fade: 0 });
    await engine.close();
  });

  it('re-seams the chain on a rate change, from the same position', async () => {
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    await engine.loadSound('bed', 'mock://bed.webm', { bus: 'music' });
    const before = spy.mock.calls.length;
    const v = engine.sound('bed').play({ loop: true, loopCrossfade: 0.05 });
    vi.advanceTimersByTime(200);
    v.setPlaybackRate(2);
    const fresh = sources()[before + 1]!;
    expect(fresh._startArgs?.offset).toBeCloseTo(0.2, 2);
    expect(v.playbackRate).toBe(2);
    v.stop({ fade: 0 });
    await engine.close();
  });
});

describe('pause/resume on a looping region (B7)', () => {
  it('resumes inside [loopStart, loopEnd)', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    const sp = await engine.loadSprite(
      'ui',
      'mock://ui.webm',
      { hum: { start: 0.3, duration: 0.2, loop: true } },
      {
        bus: 'sfx',
      },
    );
    const v = sp.play('hum');
    vi.advanceTimersByTime(500);
    v.pause();
    const before = spy.mock.calls.length;
    v.resume();
    const resumed = sources()[before]!;
    // 0.3 + 0.5 s played = 0.8, which wraps to 0.3 + (0.5 % 0.2) = 0.4.
    expect(resumed._startArgs?.offset).toBeCloseTo(0.4, 3);
    v.stop({ fade: 0 });
    await engine.close();
  });
});

describe('voice lifecycle (B10, B12)', () => {
  it('takes its abort listener off the signal when it ends', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    await engine.loadSound('c', 'mock://c.webm', { bus: 'sfx' });
    const ac = new AbortController();
    const remove = vi.spyOn(ac.signal, 'removeEventListener');
    const v = engine.sound('c').play({ signal: ac.signal });
    v.stop({ fade: 0 });
    await v.ended;
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    await engine.close();
  });

  it('ignores fade() once a stop is in progress', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    await engine.loadSound('c', 'mock://c.webm', { bus: 'sfx' });
    const v = engine.sound('c').play();
    v.stop({ fade: 0.05 });
    const gain = (
      sources().at(-1)!._connections[0] as unknown as {
        gain: { events: { kind: string; value: number }[] };
      }
    ).gain;
    await v.fade({ to: 1, duration: 1 });
    const last = gain.events.at(-1)!;
    expect(last.kind).toBe('linearRamp');
    expect(last.value).toBe(0);
    vi.advanceTimersByTime(100);
    await v.ended;
    await engine.close();
  });
});

describe('scheduled starts (X1)', () => {
  it('starts the source at `at` and emits started then', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    await engine.loadSound('c', 'mock://c.webm', { bus: 'sfx' });
    const at = engine.now + 0.5;
    const v = engine.sound('c').play({ at });
    expect(sources().at(-1)!._startArgs?.when).toBeCloseTo(at, 6);
    expect(v.startedAt).toBeCloseTo(at, 6);

    const seen: string[] = [];
    void (async () => {
      for await (const c of v.cues()) seen.push(c);
    })();
    await vi.advanceTimersByTimeAsync(100);
    expect(seen).toEqual([]);
    await vi.advanceTimersByTimeAsync(500);
    expect(seen).toEqual(['started']);
    v.stop({ fade: 0 });
    await engine.close();
  });

  it('a past `at` plays now', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    await engine.loadSound('c', 'mock://c.webm', { bus: 'sfx' });
    vi.advanceTimersByTime(1000);
    const v = engine.sound('c').play({ at: 0.2 });
    expect(v.startedAt).toBeCloseTo(engine.now, 3);
    v.stop({ fade: 0 });
    await engine.close();
  });

  it('a region bound counts from the scheduled start', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    const sp = await engine.loadSprite(
      'ui',
      'mock://ui.webm',
      { a: { start: 0, duration: 0.2 } },
      { bus: 'sfx' },
    );
    const v = sp.play('a', { at: engine.now + 0.5 });
    vi.advanceTimersByTime(600);
    expect(v.isDone).toBe(false);
    vi.advanceTimersByTime(200);
    await v.ended;
    await engine.close();
  });
});
