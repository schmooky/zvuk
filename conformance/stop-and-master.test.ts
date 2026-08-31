import { describe, expect, it } from 'vitest';
import { Bus, Master, Sound } from '../src/index';
import { dc, maxStep, offline, peak, sampleAt, sine } from './render';

/** Build a Sound wired into a Bus on an offline context. */
function soundOn(ctx: OfflineAudioContext, buffer: AudioBuffer) {
  const audioCtx = ctx as unknown as AudioContext;
  const bus = new Bus(audioCtx, 'sfx');
  bus.output.connect(ctx.destination);
  const sound = new Sound('s', {
    ctx: audioCtx,
    buffer,
    defaultBus: 'sfx',
    resolveBusInput: () => bus.input,
    trackVoice: () => undefined,
    releaseVoice: () => undefined,
  });
  return { bus, sound };
}

describe('voice.stop()', () => {
  it('fades out instead of cutting the waveform', async () => {
    const ctx = offline(0.1);
    const buf = ctx.createBuffer(1, ctx.length, ctx.sampleRate);
    buf.getChannelData(0).fill(1);
    const { sound } = soundOn(ctx, buf);

    const v = sound.play({});
    v.stop({ fade: 0.01 });

    const out = (await ctx.startRendering()).getChannelData(0);
    // A hard cut steps straight from 1 to 0 in one sample.
    expect(maxStep(out)).toBeLessThan(0.01);
    expect(sampleAt(out, 0)).toBeCloseTo(1, 2);
    expect(sampleAt(out, 0.02)).toBeCloseTo(0, 3);
  });
});

describe('Master', () => {
  it('limits peaks above the threshold', async () => {
    const loud = async (limiter: boolean) => {
      const ctx = offline(0.3);
      const master = new Master(ctx as unknown as AudioContext, {
        limiter: limiter ? { threshold: -20, ratio: 20, attack: 0.001, release: 0.05 } : undefined,
      });
      const src = sine(ctx, 0.3, 220, 1);
      src.connect(master.input);
      src.start(0);
      const out = (await ctx.startRendering()).getChannelData(0);
      return peak(out.subarray(Math.round(0.1 * ctx.sampleRate)));
    };

    const [open, limited] = await Promise.all([loud(false), loud(true)]);
    expect(open).toBeGreaterThan(0.9);
    expect(limited).toBeLessThan(open * 0.8);
  });

  it('keeps its meter tap alive across setLimiter()', async () => {
    const ctx = offline(0.3);
    const master = new Master(ctx as unknown as AudioContext);
    master.input.connect(ctx.destination);

    // Attach the tap first, then rewire — rewire() used to disconnect the
    // whole input node and drop it.
    master.meter();
    master.setLimiter({ threshold: -1 });

    const src = dc(ctx, 0.3);
    src.connect(master.input);
    src.start(0);
    await ctx.startRendering();

    expect(master.meter().rms).toBeGreaterThan(0.1);
  });

  it('ramps headroom rather than stepping', async () => {
    const ctx = offline(0.2);
    const master = new Master(ctx as unknown as AudioContext);
    master.input.connect(ctx.destination);
    const src = dc(ctx, 0.2);
    src.connect(master.input);
    src.start(0);

    master.setHeadroom(-12);
    const out = (await ctx.startRendering()).getChannelData(0);
    // A raw gain.value write lands the new level on sample 0. A ramp starts
    // where it was and arrives 10 ms later.
    expect(sampleAt(out, 0)).toBeCloseTo(1, 2);
    expect(maxStep(out)).toBeLessThan(0.01);
    expect(sampleAt(out, 0.05)).toBeCloseTo(10 ** (-12 / 20), 2);
  });
});
