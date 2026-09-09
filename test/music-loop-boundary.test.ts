import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEngine } from '../src/index';

/**
 * `skipToOutro({ at: 'loop-end' })` is the "end the music musically" call: it
 * lets the current loop iteration finish and starts the outro on the natural
 * boundary. It works off an absolute audio time the loop bookkeeping is
 * supposed to keep pointing at the *next* boundary.
 *
 * Same family as the crossfade stall: an absolute audio time that has gone
 * stale, then used as though it were still ahead of the clock. Engines clamp a
 * past-dated `start()`/`stop()` up to the current time, so the music cuts and
 * the outro fires instantly instead of on the bar.
 */

/** The fake decodes every asset to a 1 s buffer. */
const BUFFER_SEC = 1;

let skewSec = 0;

beforeEach(() => {
  vi.useFakeTimers();
  const real = Object.getOwnPropertyDescriptor(AudioContext.prototype, 'currentTime')?.get;
  if (!real) throw new Error('fake AudioContext has no currentTime getter to wrap');
  vi.spyOn(AudioContext.prototype, 'currentTime', 'get').mockImplementation(function (this: AudioContext) {
    return (real.call(this) as number) + skewSec;
  });
  skewSec = 0;
});

afterEach(() => {
  skewSec = 0;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Records the `when` argument of every source start, in schedule order. */
function trackStarts(seed: AudioBufferSourceNode) {
  const proto = Object.getPrototypeOf(seed) as AudioBufferSourceNode;
  const spy = vi.spyOn(proto, 'start');
  return () => spy.mock.calls.map((c) => c[0] as number | undefined);
}

describe('skipToOutro at the loop boundary', () => {
  it('lands on the next boundary after several native-loop iterations', async () => {
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    // No loopCrossfade — the default, and the path where one source loops
    // itself natively for the whole playback.
    await engine.loadMusic('bed', { loop: 'mock://loop.webm', outro: 'mock://outro.webm' }, { bus: 'music' });

    const sources = vi.spyOn(AudioContext.prototype, 'createBufferSource');
    const m = engine.music('bed').play();
    const starts = trackStarts(sources.mock.results[0]?.value as AudioBufferSourceNode);

    // Three and a bit iterations in. The first boundary is long gone; the next
    // one is at 4 s.
    skewSec = 3.4;
    m.skipToOutro({ at: 'loop-end' });

    const outroAt = starts().at(-1);
    expect(outroAt).toBeCloseTo(4 * BUFFER_SEC, 5);
    // Not "right now", which is what a stale first-boundary marker gives.
    expect(outroAt).toBeGreaterThan(skewSec);

    m.stop({ fade: 0 });
    await engine.close();
  });

  it('lands at the end of the intro, not an intro length from now', async () => {
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    await engine.loadMusic(
      'boss',
      { intro: 'mock://intro.webm', loop: 'mock://loop.webm', outro: 'mock://outro.webm' },
      { bus: 'music' },
    );

    const sources = vi.spyOn(AudioContext.prototype, 'createBufferSource');
    const m = engine.music('boss').play();
    const starts = trackStarts(sources.mock.results[0]?.value as AudioBufferSourceNode);

    // 0.6 s into a 1 s intro. The intro ends at 1 s — that's where the outro
    // belongs, not at 0.6 + 1 = 1.6 s with a hole in between.
    skewSec = 0.6;
    expect(m.currentPart).toBe('intro');
    m.skipToOutro({ at: 'loop-end' });

    expect(starts().at(-1)).toBeCloseTo(BUFFER_SEC, 5);

    m.stop({ fade: 0 });
    await engine.close();
  });

  it('starts the outro immediately when the boundary slipped past during a stall', async () => {
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    await engine.loadMusic('bed', { loop: 'mock://loop.webm', outro: 'mock://outro.webm' }, { bus: 'music' });

    const sources = vi.spyOn(AudioContext.prototype, 'createBufferSource');
    const m = engine.music('bed').play({ volume: 1 });
    const starts = trackStarts(sources.mock.results[0]?.value as AudioBufferSourceNode);

    skewSec = 2.5;
    m.skipToOutro({ at: 'loop-end' });

    // Whatever the bookkeeping says, the outro may never be stamped behind
    // the clock — engines clamp that, and a clamped stop() cuts the loop at an
    // arbitrary point instead of the boundary.
    const outroAt = starts().at(-1) ?? 0;
    expect(outroAt).toBeGreaterThanOrEqual(skewSec);

    m.stop({ fade: 0 });
    await engine.close();
  });
});
