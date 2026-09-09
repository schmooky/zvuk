import { describe, expect, it } from 'vitest';
import { scheduleSegmentEnvelope } from '../src/mixer/curve';
import { offline } from './render';

const CROSSFADE = 0.1;
const SEGMENT = 0.75;

/**
 * The loop-crossfade chain stamps each segment's envelope at an absolute
 * audio time it worked out one segment earlier. When the main thread stalls —
 * a lazily loaded bundle, a texture upload, a hidden tab's throttled timers —
 * that time has already passed by the time the arm timer runs.
 *
 * Engines don't refuse a past-dated event; they clamp it up to the current
 * time. Two past-dated events therefore land on the same instant, and the
 * second one is refused for overlapping the first one's curve. It used to
 * escape the timer callback, which then never re-armed, and the loop stayed
 * silent for the rest of the voice's life.
 */
describe('loop-crossfade envelope against a stale deadline', () => {
  it('past-dated legs collapse onto one instant and are refused (the bug)', async () => {
    const ctx = offline(2);
    let refused: string | null = null;

    const settled = ctx.suspend(1).then(() => {
      const gain = ctx.createGain();
      // The arm timer was due at 0.2 s and is only running now, at 1 s.
      const when = 0.2;
      try {
        gain.gain.setValueAtTime(0, when);
        gain.gain.setValueCurveAtTime(new Float32Array([0, 0.5, 1]), when, CROSSFADE);
        gain.gain.setValueAtTime(1, when + SEGMENT - CROSSFADE);
      } catch (e) {
        refused = (e as Error).name;
      }
      void ctx.resume();
    });

    await ctx.startRendering();
    await settled;
    // Chromium: "setValueAtTime(1, 1) overlaps setValueCurveAtTime(..., 1, 0.1)".
    // WebKit: "Events are overlapping".
    expect(refused).toBe('NotSupportedError');
  });

  it('scheduleSegmentEnvelope rebased onto the clock is accepted', async () => {
    const ctx = offline(2);
    let threw: Error | null = null;

    const settled = ctx.suspend(1).then(() => {
      const gain = ctx.createGain();
      // What the chain does now: the missed deadline is pulled up to the
      // clock before anything is stamped, so both legs stay ahead of it.
      const start = Math.max(0.2, ctx.currentTime);
      try {
        scheduleSegmentEnvelope(gain.gain, start, SEGMENT, CROSSFADE, {
          fadeIn: false,
          fadeOut: true,
        });
      } catch (e) {
        threw = e as Error;
      }
      void ctx.resume();
    });

    await ctx.startRendering();
    await settled;
    expect(threw).toBeNull();
  });

  it('renders the equal-power seam unchanged when the deadline is met', async () => {
    // The rebase must not alter the normal path: a segment scheduled ahead of
    // the clock still fades in over the crossfade window and back out at its
    // tail, and the two legs sum to constant power.
    const ctx = offline(1);
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    buf.getChannelData(0).fill(1);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    src.connect(gain).connect(ctx.destination);
    src.start(0);

    scheduleSegmentEnvelope(gain.gain, 0, SEGMENT, CROSSFADE, { fadeIn: true, fadeOut: true });

    const out = (await ctx.startRendering()).getChannelData(0);
    const at = (t: number) => out[Math.round(t * ctx.sampleRate)] ?? 0;
    expect(at(0)).toBeCloseTo(0, 2);
    // Halfway up a sin fade-in is sin(π/4) ≈ 0.707, not 0.5.
    expect(at(CROSSFADE / 2)).toBeCloseTo(Math.SQRT1_2, 1);
    expect(at(0.3)).toBeCloseTo(1, 2);
    // Fade-out mirrors it: full level at the tail's start, silent at its end.
    expect(at(SEGMENT - CROSSFADE)).toBeCloseTo(1, 2);
    expect(at(SEGMENT - 0.001)).toBeCloseTo(0, 1);
  });
});
