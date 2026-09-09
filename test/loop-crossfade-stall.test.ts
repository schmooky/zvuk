import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEngine } from '../src/index';

/**
 * A looping voice on a crossfade chain schedules each segment against an
 * absolute audio time worked out one segment earlier, and wakes a timer
 * shortly before it to hand the segment to the audio thread.
 *
 * The main thread does not always wake on time. A lazily loaded bundle, a
 * batch of texture uploads or a backgrounded tab's throttled timers can wedge
 * it for a second, by which point the deadline is behind the audio clock.
 * Engines clamp past-dated automation up to the current time, so a segment
 * stamped entirely in the past lands both of its envelope legs on the same
 * instant and the second one is refused with NotSupportedError.
 *
 * That exception escaped the timer callback, which then never re-armed: the
 * loop went silent and stayed silent, while every one-shot around it kept
 * playing. These specs pin both halves — the segment still lands, and the
 * chain still arms the one after it.
 */

const REGION = 0.75;
const CROSSFADE = 0.1;
/** Arm timer wakes 50 ms before the boundary at REGION - CROSSFADE. */
const ARM_DELAY_MS = (REGION - CROSSFADE) * 1000 - 50;

let skewSec = 0;

beforeEach(() => {
  vi.useFakeTimers();
  const real = Object.getOwnPropertyDescriptor(AudioContext.prototype, 'currentTime')?.get;
  if (!real) throw new Error('fake AudioContext has no currentTime getter to wrap');
  // The audio thread keeps running while the main thread is wedged. Fake
  // timers freeze the main thread's clock; this skew moves the audio clock on
  // top of it, so a timer can wake up behind the deadline it was armed for.
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

async function loopingVoice() {
  const engine = createEngine({ buses: { sfx: {} } });
  await engine.unlock();
  await engine.loadSound('coins', 'mock://coins.webm', { bus: 'sfx' });
  return engine;
}

describe('loop crossfade under a main-thread stall', () => {
  it('keeps the chain alive when the arm timer wakes past the deadline', async () => {
    const engine = await loopingVoice();
    const sources = vi.spyOn(AudioContext.prototype, 'createBufferSource');

    const v = engine
      .sound('coins')
      .play({ loop: true, loopStart: 0, loopEnd: REGION, loopCrossfade: CROSSFADE });
    const afterFirst = sources.mock.calls.length;

    // ~1 s stall: the boundary at 0.65 s is nearly a second behind us by the
    // time the arm timer gets to run.
    skewSec = 1;
    expect(() => vi.advanceTimersByTime(ARM_DELAY_MS)).not.toThrow();
    expect(sources.mock.calls.length).toBe(afterFirst + 1);

    // The half that actually broke in production: the segment that landed
    // late still has to arm the one after it.
    vi.advanceTimersByTime(ARM_DELAY_MS);
    expect(sources.mock.calls.length).toBe(afterFirst + 2);

    // And it keeps going, rather than limping through one recovery.
    vi.advanceTimersByTime(ARM_DELAY_MS * 3);
    expect(sources.mock.calls.length).toBeGreaterThanOrEqual(afterFirst + 4);

    v.stop({ fade: 0 });
    await engine.close();
  });

  it('stamps a late segment ahead of the audio clock, not behind it', async () => {
    const engine = await loopingVoice();
    const gains = vi.spyOn(AudioContext.prototype, 'createGain');

    const v = engine
      .sound('coins')
      .play({ loop: true, loopStart: 0, loopEnd: REGION, loopCrossfade: CROSSFADE });

    skewSec = 1;
    const before = gains.mock.results.length;
    vi.advanceTimersByTime(ARM_DELAY_MS);
    // Fake timers froze the main clock at ARM_DELAY_MS; the audio clock is
    // that plus the stall.
    const now = ARM_DELAY_MS / 1000 + skewSec;

    const segGain = gains.mock.results[before]?.value as unknown as {
      gain: { events: { time: number }[] };
    };
    const stampedAt = segGain.gain.events.map((e) => e.time);
    expect(stampedAt.length).toBeGreaterThan(0);
    // Nothing behind the clock, so nothing gets clamped onto a neighbour.
    for (const t of stampedAt) expect(t).toBeGreaterThanOrEqual(now - 1e-9);
    // And the envelope still spans the segment rather than collapsing onto a
    // single instant, which is the collision the engine refuses.
    expect(Math.max(...stampedAt) - Math.min(...stampedAt)).toBeCloseTo(REGION - CROSSFADE, 5);

    v.stop({ fade: 0 });
    await engine.close();
  });

  it('leaves the on-time path scheduling against the deadline it asked for', async () => {
    const engine = await loopingVoice();
    const gains = vi.spyOn(AudioContext.prototype, 'createGain');

    const v = engine
      .sound('coins')
      .play({ loop: true, loopStart: 0, loopEnd: REGION, loopCrossfade: CROSSFADE });

    // No stall this time — the timer wakes 50 ms early, as designed.
    const before = gains.mock.results.length;
    vi.advanceTimersByTime(ARM_DELAY_MS);

    const segGain = gains.mock.results[before]?.value as unknown as {
      gain: { events: { time: number; kind: string }[] };
    };
    const events = segGain.gain.events;
    // Fade-in still starts exactly at the boundary, and the tail's fade-out
    // still sits one crossfade window before the segment ends.
    expect(events[0]?.time).toBeCloseTo(REGION - CROSSFADE, 5);
    expect(events[1]?.kind).toBe('curve');
    expect(events[2]?.time).toBeCloseTo(2 * (REGION - CROSSFADE), 5);

    v.stop({ fade: 0 });
    await engine.close();
  });
});

describe('music loop under a main-thread stall', () => {
  it('keeps the loop chain alive when the arm timer wakes past the deadline', async () => {
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    await engine.loadMusic('bed', { loop: 'mock://loop.webm' }, { bus: 'music', loopCrossfade: CROSSFADE });

    const sources = vi.spyOn(AudioContext.prototype, 'createBufferSource');
    const m = engine.music('bed').play();
    const afterFirst = sources.mock.calls.length;

    // The fake decodes to a 1 s buffer, so the boundary is at 1 - CROSSFADE.
    const armMs = (1 - CROSSFADE) * 1000 - 50;
    skewSec = 1.5;
    expect(() => vi.advanceTimersByTime(armMs)).not.toThrow();
    expect(sources.mock.calls.length).toBe(afterFirst + 1);

    vi.advanceTimersByTime(armMs);
    expect(sources.mock.calls.length).toBe(afterFirst + 2);

    m.stop({ fade: 0 });
    await engine.close();
  });
});
