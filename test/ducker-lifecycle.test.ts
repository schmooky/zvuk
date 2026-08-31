import { describe, expect, it } from 'vitest';
import { createEngine, Ducker } from '../src/index';

type DuckerInternals = {
  tick: (ms?: number) => void;
  envelope: number;
  targetGain: number;
  rafId: number | null;
  gain: GainNode;
};
type LoggedParam = AudioParam & { events: { kind: string; value?: number }[] };

describe('Ducker lifecycle', () => {
  it('starts at unity instead of swelling the target bus up from silence', async () => {
    const engine = createEngine({ buses: { voice: {}, music: {} } });
    await engine.unlock();
    const d = new Ducker(engine.context, engine.bus('voice')) as unknown as DuckerInternals;
    const param = d.gain.gain as LoggedParam;

    // Nothing is playing on the source bus, so nothing should have been
    // written to the insert's gain at all.
    expect(param.value).toBe(1);
    expect(param.events.filter((e) => e.value !== 1)).toHaveLength(0);

    if (d.rafId != null) cancelAnimationFrame(d.rafId);
    await engine.close();
  });

  it('ramps to unity on bypass and parks the frame loop', async () => {
    const engine = createEngine({ buses: { voice: {}, music: {} } });
    await engine.unlock();
    const ducker = new Ducker(engine.context, engine.bus('voice'));
    const d = ducker as unknown as DuckerInternals;
    const param = d.gain.gain as LoggedParam;

    d.envelope = 0.4;
    d.targetGain = 0.4;
    param.events.length = 0;

    ducker.bypassed = true;
    // A raw `.value = 1` write clicks; the insert should ramp.
    expect(param.events.some((e) => e.kind === 'target' && e.value === 1)).toBe(true);
    expect(d.rafId).toBeNull();

    ducker.bypassed = false;
    // Un-bypass must re-enter from unity, otherwise the envelope chases a
    // stale value and a loud source reads as "already at target".
    expect(d.envelope).toBe(1);
    expect(d.targetGain).toBe(1);
    expect(d.rafId).not.toBeNull();

    ducker.dispose();
    await engine.close();
  });

  it('resets the envelope when the tab becomes visible again', async () => {
    const engine = createEngine({ buses: { voice: {}, music: {} } });
    await engine.unlock();
    const ducker = new Ducker(engine.context, engine.bus('voice'));
    const d = ducker as unknown as DuckerInternals;

    // rAF stops in a hidden tab, so the envelope freezes mid-duck.
    d.envelope = 0.3;
    d.targetGain = 0.3;
    document.dispatchEvent(new Event('visibilitychange'));

    expect(d.envelope).toBe(1);
    expect(d.targetGain).toBe(1);

    ducker.dispose();
    await engine.close();
  });

  it('constructs without requestAnimationFrame (SSR)', async () => {
    const engine = createEngine({ buses: { voice: {}, music: {} } });
    await engine.unlock();
    const raf = globalThis.requestAnimationFrame;
    (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = undefined;
    try {
      expect(() => new Ducker(engine.context, engine.bus('voice'))).not.toThrow();
    } finally {
      globalThis.requestAnimationFrame = raf;
    }
    await engine.close();
  });
});
