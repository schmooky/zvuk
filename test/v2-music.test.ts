import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEngine } from '../src/index';

type FakeSource = {
  buffer: AudioBuffer | null;
  loop: boolean;
  _startArgs: { when?: number; offset?: number; duration?: number } | null;
  _stopWhen: number | undefined;
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
const last = (): FakeSource => spy.mock.results.at(-1)!.value as unknown as FakeSource;
const created = (from: number): FakeSource[] =>
  spy.mock.results.slice(from).map((r) => r.value as unknown as FakeSource);

async function setup(opts: { bpm?: number; loopCrossfade?: number } = {}) {
  const engine = createEngine({ buses: { music: {} } });
  await engine.unlock();
  const m = await engine.loadMusic(
    'theme',
    { intro: 'mock://intro.webm', loop: 'mock://loop.webm', outro: 'mock://outro.webm' },
    { bus: 'music', ...opts },
  );
  return { engine, m };
}

describe('MusicVoice pause/resume (A2)', () => {
  it('resumes the intro at its offset, then hands over to the loop', async () => {
    const { engine, m } = await setup();
    const v = m.play();
    vi.advanceTimersByTime(400);
    v.pause();
    expect(v.isPaused).toBe(true);
    vi.advanceTimersByTime(1000);
    const before = spy.mock.calls.length;
    v.resume();
    const [intro, loop] = created(before);
    expect(intro!._startArgs?.offset).toBeCloseTo(0.4, 2);
    // Loop starts when the remaining 0.6 s of intro has played.
    expect((loop!._startArgs?.when ?? 0) - engine.now).toBeCloseTo(0.6, 2);
    expect(v.currentPart).toBe('intro');
    v.stop({ fade: 0 });
    await engine.close();
  });

  it('resumes the loop mid-buffer', async () => {
    const { engine, m } = await setup();
    const v = m.play();
    vi.advanceTimersByTime(1300); // intro 1 s, then 0.3 s into the loop
    v.pause();
    const before = spy.mock.calls.length;
    v.resume();
    const loop = created(before)[0]!;
    expect(loop.loop).toBe(true);
    expect(loop._startArgs?.offset).toBeCloseTo(0.3, 2);
    expect(v.currentPart).toBe('loop');
    v.stop({ fade: 0 });
    await engine.close();
  });

  it('resumes a crossfading loop mid-buffer too', async () => {
    const { engine, m } = await setup({ loopCrossfade: 0.05 });
    const v = m.play();
    vi.advanceTimersByTime(1300);
    v.pause();
    const before = spy.mock.calls.length;
    v.resume();
    const seg = created(before)[0]!;
    expect(seg.loop).toBe(false);
    expect(seg._startArgs?.offset).toBeCloseTo(0.3, 2);
    expect(seg._startArgs?.duration).toBeCloseTo(0.7, 2);
    v.stop({ fade: 0 });
    await engine.close();
  });

  it('keeps a pending skipToOutro across a pause', async () => {
    const { engine, m } = await setup();
    const v = m.play();
    vi.advanceTimersByTime(1200);
    v.skipToOutro();
    v.pause();
    v.resume();
    const outro = last();
    expect(outro._startArgs).not.toBeNull();
    expect(outro._startArgs!.offset ?? 0).toBe(0);
    v.stop({ fade: 0 });
    await engine.close();
  });

  it('stop() while paused ends the voice', async () => {
    const { engine, m } = await setup();
    const v = m.play();
    v.pause();
    v.stop();
    await v.ended;
    expect(v.currentPart).toBe('ended');
    await engine.close();
  });
});

describe('musical grid (X2)', () => {
  it('reports beats and bars from the end of the intro', async () => {
    const { engine, m } = await setup({ bpm: 120 });
    expect(m.grid).toEqual({ bpm: 120, beatsPerBar: 4, offset: 1 });
    const t0 = engine.now;
    const v = m.play();
    // Grid zero is the loop's first sample, 1 s in. Beat = 0.5 s, bar = 2 s.
    expect(v.nextBeat()! - t0).toBeCloseTo(1, 3);
    vi.advanceTimersByTime(1100);
    expect(v.nextBeat()! - t0).toBeCloseTo(1.5, 2);
    expect(v.nextBar()! - t0).toBeCloseTo(3, 2);
    expect(v.beatAt()!.beatInBar).toBe(0);
    v.stop({ fade: 0 });
    await engine.close();
  });

  it('without bpm there is no grid', async () => {
    const { engine, m } = await setup();
    const v = m.play();
    expect(m.grid).toBeUndefined();
    expect(v.nextBeat()).toBeUndefined();
    expect(v.nextBar()).toBeUndefined();
    expect(v.onBeat(() => {})).toBeTypeOf('function');
    v.stop({ fade: 0 });
    await engine.close();
  });

  it('onBeat fires ahead of each beat with its exact time', async () => {
    const { engine, m } = await setup({ bpm: 120 });
    const t0 = engine.now;
    const v = m.play();
    const beats: { time: number; beat: number; bar: number; beatInBar: number }[] = [];
    const off = v.onBeat((e) => beats.push(e));
    // Beats at 1, 1.5, 2, 2.5 s, each announced 50 ms early.
    await vi.advanceTimersByTimeAsync(2400);
    expect(beats.map((b) => b.beat)).toEqual([0, 1, 2]);
    await vi.advanceTimersByTimeAsync(60);
    expect(beats.map((b) => b.beat)).toEqual([0, 1, 2, 3]);
    expect(beats[2]!.time - t0).toBeCloseTo(2, 2);
    expect(beats[0]!.beatInBar).toBe(0);
    off();
    await vi.advanceTimersByTimeAsync(1000);
    expect(beats).toHaveLength(4);
    v.stop({ fade: 0 });
    await engine.close();
  });

  it("skipToOutro({ at: 'bar' }) starts the outro on the next downbeat", async () => {
    const { engine, m } = await setup({ bpm: 120 });
    const t0 = engine.now;
    const v = m.play();
    vi.advanceTimersByTime(1300);
    v.skipToOutro({ at: 'bar' });
    const outro = last();
    expect((outro._startArgs?.when ?? 0) - t0).toBeCloseTo(3, 2);
    vi.advanceTimersByTime(2000);
    expect(v.currentPart).toBe('outro');
    v.stop({ fade: 0 });
    await engine.close();
  });

  it("'bar' falls back to 'loop-end' without bpm", async () => {
    const { engine, m } = await setup();
    const t0 = engine.now;
    const v = m.play();
    vi.advanceTimersByTime(1300);
    v.skipToOutro({ at: 'beat' });
    // Loop is 1 s long and started at 1 s: next boundary at 2 s.
    expect((last()._startArgs?.when ?? 0) - t0).toBeCloseTo(2, 2);
    v.stop({ fade: 0 });
    await engine.close();
  });

  it('a stinger scheduled on nextBar() starts on the downbeat', async () => {
    const { engine, m } = await setup({ bpm: 120 });
    await engine.loadSound('stinger', 'mock://stinger.webm', { bus: 'music' });
    const v = m.play();
    vi.advanceTimersByTime(1200);
    const bar = v.nextBar()!;
    const s = engine.sound('stinger').play({ at: bar });
    expect(last()._startArgs?.when).toBeCloseTo(bar, 6);
    s.stop({ fade: 0 });
    v.stop({ fade: 0 });
    await engine.close();
  });

  it('music play({ at }) schedules the intro', async () => {
    const { engine, m } = await setup();
    const at = engine.now + 0.25;
    const before = spy.mock.calls.length;
    const v = m.play({ at });
    expect(created(before)[0]!._startArgs?.when).toBeCloseTo(at, 6);
    v.stop({ fade: 0 });
    await engine.close();
  });
});
