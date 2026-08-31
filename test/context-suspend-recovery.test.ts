import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/index';

type FakeCtx = AudioContext & { _setState: (s: 'suspended' | 'running' | 'closed') => void };

describe('AudioContextHost suspension', () => {
  it('reports suspended and recovers through unlock()', async () => {
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    expect(engine.state).toBe('live');

    const seen: string[] = [];
    engine.onStateChange((s) => seen.push(s));

    const ctx = engine.context as FakeCtx;
    // What autoPauseOnHidden does on tab hide.
    ctx._setState('suspended');
    expect(engine.state).toBe('suspended');
    expect(seen).toContain('suspended');

    // A manual unlock used to early-return on the cached 'live' enum and
    // leave the context suspended with no way back.
    await engine.unlock();
    expect(ctx.state).toBe('running');
    expect(engine.state).toBe('live');
    await engine.close();
  });

  it('falls back to webkitAudioContext when AudioContext is absent', async () => {
    const g = globalThis as unknown as { AudioContext?: unknown; webkitAudioContext?: unknown };
    const real = g.AudioContext;
    g.webkitAudioContext = real;
    g.AudioContext = undefined;
    try {
      const engine = createEngine({ buses: { music: {} } });
      await expect(engine.unlock()).resolves.toBeUndefined();
      await engine.close();
    } finally {
      g.AudioContext = real;
      g.webkitAudioContext = undefined;
    }
  });
});
