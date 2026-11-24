import { describe, expect, it } from 'vitest';
import { Bus, Sound } from '../src/index';
import { maxStep, offline, peak, sampleAt } from './render';

/** A constant-1 buffer, so the rendered output is the gain applied to it. */
function dcBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate);
  buf.getChannelData(0).fill(1);
  return buf;
}

function rig(ctx: OfflineAudioContext, buses: Record<string, ConstructorParameters<typeof Bus>[2]>) {
  const audioCtx = ctx as unknown as AudioContext;
  const map = new Map<string, Bus>();
  for (const [name, cfg] of Object.entries(buses)) map.set(name, new Bus(audioCtx, name, cfg));
  const sound = (buffer: AudioBuffer, defaultBus: string) =>
    new Sound('s', {
      ctx: audioCtx,
      buffer,
      defaultBus,
      resolveBusInput: (b) => map.get(b)!.input,
      trackVoice: (v, b) => map.get(b)!.trackVoice(v),
      releaseVoice: (v, b) => map.get(b)!.releaseVoice(v),
      planBus: (b, c) => map.get(b)!.planConcurrency(c),
      resolveBus: (b) => map.get(b)!,
    });
  return { bus: (n: string) => map.get(n)!, sound };
}

describe("steal: 'none'", () => {
  it('a rejected voice makes no sound at all', async () => {
    const ctx = offline(0.1);
    const { bus, sound } = rig(ctx, { sfx: { concurrency: { max: 1, steal: 'none' } } });
    bus('sfx').output.connect(ctx.destination);
    const s = sound(dcBuffer(ctx, 0.1), 'sfx');
    s.play();
    const second = s.play();
    expect(second.rejected).toBe(true);
    const out = (await ctx.startRendering()).getChannelData(0);
    // v1 started the second voice and faded it out over 8 ms: 2.0 at the top.
    expect(peak(out)).toBeLessThan(1.001);
  });
});

describe('play({ at })', () => {
  it('starts on the scheduled sample', async () => {
    const ctx = offline(0.3);
    const { bus, sound } = rig(ctx, { sfx: {} });
    bus('sfx').output.connect(ctx.destination);
    sound(dcBuffer(ctx, 0.3), 'sfx').play({ at: 0.1 });
    const out = (await ctx.startRendering()).getChannelData(0);
    expect(sampleAt(out, 0.099)).toBe(0);
    expect(sampleAt(out, 0.101)).toBeCloseTo(1, 5);
  });
});

describe('play({ duck })', () => {
  it('pulls the target bus down from the ducking voice start', async () => {
    const ctx = offline(0.4);
    const { bus, sound } = rig(ctx, { music: {}, sfx: {} });
    // Only the music bus reaches the output; the sfx voice is the key.
    bus('music').output.connect(ctx.destination);
    sound(dcBuffer(ctx, 0.4), 'music').play();
    sound(dcBuffer(ctx, 0.4), 'sfx').play({ at: 0.1, duck: { bus: 'music', amount: 0.5, attack: 0.02 } });
    const out = (await ctx.startRendering()).getChannelData(0);
    expect(sampleAt(out, 0.09)).toBeCloseTo(1, 3);
    expect(sampleAt(out, 0.11)).toBeCloseTo(0.75, 1);
    expect(sampleAt(out, 0.2)).toBeCloseTo(0.5, 3);
  });
});

describe('loop crossfade at pitch 2', () => {
  it('fades the segment out before its source runs out', async () => {
    const ctx = offline(0.6);
    const { bus, sound } = rig(ctx, { music: {} });
    bus('music').output.connect(ctx.destination);
    // A 1 s region at rate 2 lasts 0.5 s. v1 stamped the fade-out at 0.95 s,
    // so the source stopped at 0.5 s with the gain still at 1: a hard cut.
    sound(dcBuffer(ctx, 1), 'music').play({ loop: true, loopCrossfade: 0.05, pitch: 2 });
    const out = (await ctx.startRendering()).getChannelData(0);
    expect(sampleAt(out, 0.3)).toBeCloseTo(1, 3);
    expect(sampleAt(out, 0.475)).toBeLessThan(0.9);
    expect(sampleAt(out, 0.475)).toBeGreaterThan(0.1);
    expect(maxStep(out, Math.round(0.4 * ctx.sampleRate), Math.round(0.55 * ctx.sampleRate))).toBeLessThan(
      0.05,
    );
  });
});
