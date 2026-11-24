import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/index';
import { applyRamp } from '../src/mixer/curve';

type EventLog = { kind: string; time: number; value?: number }[];
type LoggedParam = AudioParam & { events: EventLog };

function fakeParam(): LoggedParam {
  const ctx = new AudioContext();
  return ctx.createGain().gain as unknown as LoggedParam;
}

describe('applyRamp interrupting an in-flight curve', () => {
  it('does not throw when a second non-linear ramp lands inside the first curve window', () => {
    const param = fakeParam();
    applyRamp(param, 0, 1, 2, 'equal-power');
    // 0.5 s into a 2 s setValueCurveAtTime window. cancelScheduledValues
    // leaves the curve in place, so the follow-up setValueAtTime throws
    // NotSupportedError unless the curve is cancelled-and-held first.
    expect(() => applyRamp(param, 0.5, 0, 1, 'equal-power')).not.toThrow();
  });

  it('uses cancelAndHoldAtTime when the platform exposes it', () => {
    const param = fakeParam();
    applyRamp(param, 0, 1, 2, 'equal-power');
    param.events.length = 0;
    applyRamp(param, 0.5, 0, 1, 'equal-power');
    expect(param.events.some((e) => e.kind === 'cancelHold')).toBe(true);
    expect(param.events.some((e) => e.kind === 'curve')).toBe(true);
  });

  it('falls back to cancelScheduledValues where cancelAndHoldAtTime is missing', () => {
    const param = fakeParam();
    const held = (param as unknown as { cancelAndHoldAtTime: unknown }).cancelAndHoldAtTime;
    // Firefox has no cancelAndHoldAtTime; the fallback path must still not throw.
    (param as unknown as { cancelAndHoldAtTime: unknown }).cancelAndHoldAtTime = undefined;
    try {
      applyRamp(param, 0, 1, 2, 'equal-power');
      expect(() => applyRamp(param, 0.5, 0, 1, 'linear')).not.toThrow();
      expect(param.events.some((e) => e.kind === 'cancel')).toBe(true);
    } finally {
      (param as unknown as { cancelAndHoldAtTime: unknown }).cancelAndHoldAtTime = held;
    }
  });

  it('survives two engine.crossfade calls in quick succession', async () => {
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    await engine.loadSound('a', 'mock://a.wav', { bus: 'music' });
    await engine.loadSound('b', 'mock://b.wav', { bus: 'music' });
    await engine.loadSound('c', 'mock://c.wav', { bus: 'music' });

    engine.sound('a').play({ loop: true, bus: 'music' });
    // Default curve for crossfade is equal-power, i.e. setValueCurveAtTime.
    const first = engine.crossfade('a', 'b', { duration: 2, bus: 'music' });
    await new Promise((r) => setTimeout(r, 30));
    expect(() => engine.crossfade('b', 'c', { duration: 2, bus: 'music' })).not.toThrow();

    for (const v of engine.activeVoices()) v.stop({ fade: 0 });
    void first;
    await engine.close();
  });
});

describe('applyRamp on an engine without cancelAndHoldAtTime (Firefox)', () => {
  it('clears a running curve instead of throwing when the pin is refused', async () => {
    const calls: string[] = [];
    let curveUntil = -1;
    // Firefox's rules: no cancelAndHoldAtTime; cancelScheduledValues(t) keeps
    // a curve that started before t; any event or value write inside it throws.
    const refuse = (t: number) => {
      if (t <= curveUntil)
        throw new DOMException("Can't add events during a curve event", 'NotSupportedError');
    };
    const param = {
      value: 1,
      cancelScheduledValues(t: number) {
        calls.push(`cancel(${t})`);
        if (t === 0) curveUntil = -1;
      },
      setValueAtTime(_v: number, t: number) {
        refuse(t);
        calls.push(`set(${t})`);
      },
      setValueCurveAtTime(_c: Float32Array, t: number, d: number) {
        refuse(t);
        curveUntil = t + d;
        calls.push(`curve(${t})`);
      },
      linearRampToValueAtTime(_v: number, t: number) {
        refuse(t);
      },
    } as unknown as AudioParam;

    applyRamp(param, 0, 0, 0.5, 'equal-power');
    expect(() => applyRamp(param, 0.2, 1, 0.3, 'equal-power')).not.toThrow();
    expect(calls).toContain('cancel(0)');
    expect(calls.at(-1)).toBe('curve(0.2)');
  });
});
