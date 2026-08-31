import { describe, expect, it } from 'vitest';
import { createEngine, Ducker } from '../src/index';

type DuckerInternals = { tick: (ms?: number) => void; envelope: number; rafId: number | null };

describe('Ducker frame-delta timing', () => {
  it('advances the envelope by the real frame delta, not a fixed 1/60', async () => {
    const engine = createEngine({ buses: { voice: {}, music: {} } });
    await engine.unlock();

    // Build a ducker and stop its self-scheduling rAF loop so we can drive
    // ticks manually with controlled timestamps.
    const make = (): DuckerInternals => {
      const d = new Ducker(engine.context, engine.bus('voice')) as unknown as DuckerInternals;
      if (d.rafId != null) cancelAnimationFrame(d.rafId);
      return d;
    };

    const fast = make(); // will step at 120 Hz
    const slow = make(); // will step at 30 Hz

    // Both start fully ducked so the release leg has somewhere to travel.
    fast.envelope = 0;
    slow.envelope = 0;

    // First real timestamp seeds lastTickMs (uses the fallback dt) — identical
    // for both.
    fast.tick(1000);
    slow.tick(1000);
    const fast0 = fast.envelope;
    const slow0 = slow.envelope;
    expect(fast0).toBeCloseTo(slow0, 10);

    // Second tick with different frame deltas.
    fast.tick(1000 + 1000 / 120); // ~8.3 ms
    slow.tick(1000 + 1000 / 30); // ~33.3 ms

    const fastAdvance = fast.envelope - fast0;
    const slowAdvance = slow.envelope - slow0;

    // With silence the envelope releases toward 1; a ~4× longer frame should
    // advance it well past the fast one. The old fixed 1/60 made them equal.
    expect(slowAdvance).toBeGreaterThan(fastAdvance * 1.5);

    if (fast.rafId != null) cancelAnimationFrame(fast.rafId);
    if (slow.rafId != null) cancelAnimationFrame(slow.rafId);
    await engine.close();
  });
});
