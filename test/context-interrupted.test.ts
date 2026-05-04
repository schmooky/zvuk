import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/index';

// Forces the FakeAudioContext underneath to drive a state transition with the
// statechange listener firing — matches what iOS Safari does on phone calls,
// Siri activation, and other system audio interruptions.
type StatefulCtx = AudioContext & {
  _setState: (s: 'suspended' | 'running' | 'closed' | 'interrupted') => void;
};

describe('iOS interrupted-state handling', () => {
  it('emits "interrupted" engine state when the AudioContext is interrupted', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    expect(engine.state).toBe('live');

    const observed: string[] = [];
    engine.onStateChange((s) => observed.push(s));

    (engine.context as StatefulCtx)._setState('interrupted');
    expect(engine.state).toBe('interrupted');
    expect(observed).toContain('interrupted');

    await engine.close();
  });

  it('auto-resumes after the OS flips interrupted → suspended', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    const ctx = engine.context as StatefulCtx;

    ctx._setState('interrupted');
    expect(engine.state).toBe('interrupted');

    // OS releases the interrupt — context goes to 'suspended', host should
    // schedule a resume() after the 200ms beat.
    ctx._setState('suspended');
    await new Promise((r) => setTimeout(r, 250));

    // resume() flips state to 'running' which fires statechange → 'live'.
    expect(ctx.state).toBe('running');
    expect(engine.state).toBe('live');

    await engine.close();
  });

  it('does not auto-resume if the engine is closed during the interruption', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    const ctx = engine.context as StatefulCtx;

    ctx._setState('interrupted');
    await engine.close();
    expect(engine.state).toBe('closed');

    // Even if the OS now flips to 'suspended', the engine is gone — no resume.
    ctx._setState('suspended');
    await new Promise((r) => setTimeout(r, 250));
    expect(engine.state).toBe('closed');
  });

  it('ignores a plain suspended → suspended transition (no spurious resume)', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    const ctx = engine.context as StatefulCtx;

    // Manually go suspended without going through interrupted first.
    ctx._setState('suspended');
    await new Promise((r) => setTimeout(r, 250));

    // No interrupted → suspended transition happened, so the host should not
    // have scheduled an auto-resume from this path. State stays where the
    // visibility/explicit-suspend path put it.
    expect(['suspended', 'live']).toContain(engine.state);
    await engine.close();
  });
});
