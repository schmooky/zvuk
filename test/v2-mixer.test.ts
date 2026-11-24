import { afterEach, describe, expect, it, vi } from 'vitest';
import { Compressor, createEngine, Filter, Parameter, Reverb, StreamSound } from '../src/index';

type Param = { value: number; events: { kind: string; time: number; value: number }[] };

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('bus.removeFx (B9)', () => {
  it('disconnects the removed insert so its tail stops', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    const bus = engine.bus('sfx');
    const verb = new Reverb(engine.context);
    const out = verb.output as unknown as { _connections: unknown[] };
    bus.addFx(verb);
    expect(out._connections.length).toBe(1);
    bus.removeFx(verb);
    expect(out._connections.length).toBe(0);
    await engine.close();
  });
});

describe('voice-driven ducking (X3)', () => {
  it('ducks the target bus from the voice start and releases on end', async () => {
    vi.useFakeTimers();
    const engine = createEngine({ buses: { music: {}, sfx: {} } });
    await engine.unlock();
    await engine.loadSound('win', 'mock://win.webm', { bus: 'sfx' });
    const music = engine.bus('music');
    const at = engine.now + 0.5;
    const v = engine.sound('win').play({ at, duck: { bus: 'music', amount: 0.6, attack: 0.1 } });
    const duck = (music as unknown as { duckNode: { gain: Param } }).duckNode.gain;
    const ramp = duck.events.filter((e) => e.kind === 'linearRamp').at(-1)!;
    expect(ramp.value).toBeCloseTo(0.4, 5);
    expect(ramp.time).toBeCloseTo(at + 0.1, 3);

    v.stop({ fade: 0 });
    await v.ended;
    await Promise.resolve();
    const release = duck.events.filter((e) => e.kind === 'linearRamp').at(-1)!;
    expect(release.value).toBe(1);
    await engine.close();
  });

  it('overlapping ducks take the deepest and release with the last', async () => {
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    const music = engine.bus('music');
    const r1 = music.duck({ amount: 0.3, attack: 0 });
    const r2 = music.duck({ amount: 0.7, attack: 0 });
    expect(music.duckLevel).toBeCloseTo(0.3, 5);
    r2();
    expect(music.duckLevel).toBeCloseTo(0.7, 5);
    r1();
    r1();
    expect(music.duckLevel).toBe(1);
    await engine.close();
  });
});

describe('Parameter.rampTo (F3)', () => {
  it('glides through intermediate values and lands on the target', async () => {
    vi.useFakeTimers();
    const p = new Parameter('tension', 0);
    const seen: number[] = [];
    p.subscribe((v) => seen.push(v));
    const done = p.rampTo(1, 0.1);
    expect(p.gliding).toBe(true);
    await vi.advanceTimersByTimeAsync(200);
    await done;
    expect(p.value).toBe(1);
    expect(p.gliding).toBe(false);
    expect(seen.some((v) => v > 0 && v < 1)).toBe(true);
  });

  it('set() interrupts a glide and resolves it', async () => {
    vi.useFakeTimers();
    const p = new Parameter('x', 0);
    const done = p.rampTo(1, 10);
    p.set(0.25);
    await done;
    await vi.advanceTimersByTimeAsync(500);
    expect(p.value).toBe(0.25);
  });
});

describe('snapshots with sends, FX and solo (F4)', () => {
  it('captures and re-applies send levels, FX bypass and solo', async () => {
    const engine = createEngine({ buses: { music: {}, sfx: {}, verb: {} } });
    await engine.unlock();
    const send = engine.bus('music').send(engine.bus('verb'), { amount: 0.3 });
    const comp = new Compressor(engine.context);
    engine.bus('sfx').addFx(comp);
    engine.bus('sfx').solo();
    const snap = engine.captureSnapshot('combat');
    expect(snap.state.sends).toEqual({ music: { verb: 0.3 } });
    expect(snap.state.fx).toEqual({ sfx: [false] });
    expect(snap.state.solo).toEqual(['sfx']);

    send.amount = 0.9;
    comp.bypassed = true;
    engine.bus('sfx').unsolo();
    engine.bus('music').solo();
    await snap.apply();
    expect(send.amount).toBeCloseTo(0.3, 5);
    expect(comp.bypassed).toBe(false);
    expect(engine.bus('sfx').soloed).toBe(true);
    expect(engine.bus('music').soloed).toBe(false);
    await engine.close();
  });

  it('blends send levels', async () => {
    const engine = createEngine({ buses: { music: {}, verb: {} } });
    await engine.unlock();
    const send = engine.bus('music').send(engine.bus('verb'), { amount: 0 });
    const dry = engine.snapshot('dry', { buses: {}, parameters: {}, sends: { music: { verb: 0 } } });
    const wet = engine.snapshot('wet', { buses: {}, parameters: {}, sends: { music: { verb: 1 } } });
    engine.blendSnapshots(dry, wet, 0.25);
    expect(send.amount).toBeCloseTo(0.25, 5);
    await engine.close();
  });
});

describe('spatial glides and listener (A7)', () => {
  it('setPosition glides with setTargetAtTime; glide 0 jumps', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    await engine.loadSound('c', 'mock://c.webm', { bus: 'sfx' });
    const v = engine.sound('c').play({ spatializer: { position: [0, 0, 0], panningModel: 'equalpower' } });
    const sp = v.spatializer!;
    sp.setPosition(5, 0, 0);
    const panner = (sp as unknown as { panner: { panningModel: string; positionX: Param } }).panner;
    expect(panner.panningModel).toBe('equalpower');
    expect(panner.positionX.events.at(-1)!.kind).toBe('target');
    sp.setGlide(0);
    sp.setPosition(1, 0, 0);
    expect(panner.positionX.events.at(-1)!.kind).toBe('setValue');
    v.stop({ fade: 0 });
    await engine.close();
  });

  it('engine.listener moves and turns the listener', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    engine.listener.setGlide(0);
    engine.listener.setPosition(1, 2, 3);
    engine.listener.setOrientation([1, 0, 0]);
    expect(engine.listener.position).toEqual([1, 2, 3]);
    const l = engine.context.listener as unknown as { forwardX: Param; upY: Param };
    expect(l.forwardX.value).toBe(1);
    expect(l.upY.value).toBe(1);
    await engine.close();
  });
});

describe('click-free FX (A8)', () => {
  it('filter changes glide and bypass crossfades instead of rewiring', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    const f = new Filter(engine.context, { frequency: 1000 });
    f.setFrequency(400);
    const biquad = (f as unknown as { filter: { frequency: Param } }).filter;
    expect(biquad.frequency.events.at(-1)!.kind).toBe('target');
    const sw = (f as unknown as { bypass: { dry: { gain: Param }; wet: { gain: Param } } }).bypass;
    f.bypassed = true;
    expect(f.bypassed).toBe(true);
    expect(sw.wet.gain.events.at(-1)).toMatchObject({ kind: 'target', value: 0 });
    expect(sw.dry.gain.events.at(-1)).toMatchObject({ kind: 'target', value: 1 });
    await engine.close();
  });

  it('reverb wet changes glide', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    const r = new Reverb(engine.context, { wet: 0.3 });
    r.setWet(0.6);
    const wet = (r as unknown as { wet: { gain: Param } }).wet;
    expect(wet.gain.events.at(-1)).toMatchObject({ kind: 'target', value: 0.6 });
    await engine.close();
  });
});

describe('StreamSound (A9)', () => {
  it('play() resolves false when the browser refuses', async () => {
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    const s = engine.loadStream('bgm', 'mock://bgm.mp3');
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(new DOMException('no', 'NotAllowedError'));
    expect(await s.play()).toBe(false);
    await engine.close();
  });

  it('play() resolves true, and ended resolves on stop()', async () => {
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    const s = engine.loadStream('bgm', 'mock://bgm.mp3');
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    expect(await s.play()).toBe(true);
    const ended = s.ended;
    s.stop();
    await ended;
    await engine.close();
  });

  it('falls back to the next URL on a media error', async () => {
    const ctx = new AudioContext();
    const s = new StreamSound('bgm', ctx, ['mock://a.webm', 'mock://b.m4a'], ctx.destination);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    await s.play();
    const el = (s as unknown as { el: HTMLAudioElement }).el;
    el.dispatchEvent(new Event('error'));
    expect(s.url).toBe('mock://b.m4a');
    expect(el.src).toContain('b.m4a');
    s.dispose();
  });
});
