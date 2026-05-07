import { describe, expect, it } from 'vitest';
import { createEngine, Send } from '../src/index';

describe('bus.send', () => {
  it('returns a Send handle that exposes amount + dispose', async () => {
    const engine = createEngine({ buses: { music: {}, verb: {} } });
    await engine.unlock();
    const send = engine.bus('music').send(engine.bus('verb'), { amount: 0.3 });
    expect(send).toBeInstanceOf(Send);
    expect(send.amount).toBeCloseTo(0.3, 3);
    expect(send.source).toBe(engine.bus('music'));
    expect(send.target).toBe(engine.bus('verb'));
    expect(send.post).toBe(true);
    send.amount = 0.5;
    expect(send.amount).toBeCloseTo(0.5, 3);
    expect(engine.bus('music').sends()).toContain(send);
    send.dispose();
    await engine.close();
  });

  it('removeSend drops the send from the source bus list', async () => {
    const engine = createEngine({ buses: { music: {}, verb: {} } });
    await engine.unlock();
    const music = engine.bus('music');
    const send = music.send(engine.bus('verb'));
    expect(music.sends()).toContain(send);
    music.removeSend(send);
    expect(music.sends()).not.toContain(send);
    await engine.close();
  });

  it('post: false taps the source bus input rather than output', async () => {
    const engine = createEngine({ buses: { music: {}, monitor: {} } });
    await engine.unlock();
    const send = engine.bus('music').send(engine.bus('monitor'), { post: false });
    expect(send.post).toBe(false);
    send.dispose();
    await engine.close();
  });
});

describe('bus.solo / engine solo coordinator', () => {
  it('solo() flips state and notifies the engine', async () => {
    const engine = createEngine({ buses: { music: {}, sfx: {}, voice: {} } });
    await engine.unlock();
    expect(engine.bus('music').soloed).toBe(false);
    engine.bus('music').solo();
    expect(engine.bus('music').soloed).toBe(true);
    engine.bus('music').unsolo();
    expect(engine.bus('music').soloed).toBe(false);
    await engine.close();
  });

  it('multiple buses can be soloed simultaneously (additive)', async () => {
    const engine = createEngine({ buses: { music: {}, sfx: {}, voice: {} } });
    await engine.unlock();
    engine.bus('music').solo();
    engine.bus('sfx').solo();
    expect(engine.bus('music').soloed).toBe(true);
    expect(engine.bus('sfx').soloed).toBe(true);
    expect(engine.bus('voice').soloed).toBe(false);
    await engine.close();
  });

  it('solo state is independent of muted — unsoloing returns to user mute setting', async () => {
    const engine = createEngine({ buses: { music: {}, sfx: {} } });
    await engine.unlock();
    engine.bus('sfx').muted = true;
    engine.bus('music').solo();
    engine.bus('music').unsolo();
    expect(engine.bus('sfx').muted).toBe(true);
    await engine.close();
  });
});

describe('engine.busGroup', () => {
  it('defines a group with members and applies level/muted/fade across them', async () => {
    const engine = createEngine({ buses: { weapons: {}, enemies: {}, environment: {} } });
    await engine.unlock();
    const combat = engine.busGroup('combat', [
      engine.bus('weapons'),
      engine.bus('enemies'),
      engine.bus('environment'),
    ]);
    combat.level = 0.5;
    expect(engine.bus('weapons').level).toBe(0.5);
    expect(engine.bus('enemies').level).toBe(0.5);
    expect(engine.bus('environment').level).toBe(0.5);

    combat.muted = true;
    expect(engine.bus('weapons').muted).toBe(true);
    expect(engine.bus('enemies').muted).toBe(true);
    expect(engine.bus('environment').muted).toBe(true);

    await engine.close();
  });

  it('lookup returns the same instance', async () => {
    const engine = createEngine({ buses: { a: {}, b: {} } });
    await engine.unlock();
    const g1 = engine.busGroup('pair', [engine.bus('a'), engine.bus('b')]);
    const g2 = engine.busGroup('pair');
    expect(g2).toBe(g1);
    await engine.close();
  });

  it('group.solo() solos every member', async () => {
    const engine = createEngine({ buses: { a: {}, b: {}, other: {} } });
    await engine.unlock();
    const pair = engine.busGroup('pair', [engine.bus('a'), engine.bus('b')]);
    pair.solo();
    expect(engine.bus('a').soloed).toBe(true);
    expect(engine.bus('b').soloed).toBe(true);
    expect(engine.bus('other').soloed).toBe(false);
    await engine.close();
  });
});

describe('engine.masterMeter', () => {
  it('returns finite { rms, peak } in [0..1]', async () => {
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    const m = engine.masterMeter();
    expect(m.rms).toBeGreaterThanOrEqual(0);
    expect(m.rms).toBeLessThanOrEqual(1);
    expect(m.peak).toBeGreaterThanOrEqual(0);
    expect(m.peak).toBeLessThanOrEqual(1);
    await engine.close();
  });
});
