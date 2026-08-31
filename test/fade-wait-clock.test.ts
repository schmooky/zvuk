import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/index';
import { waitAudio } from '../src/runtime/wait';

type FakeCtx = AudioContext & { _setState: (s: 'suspended' | 'running' | 'closed') => void };

describe('fade promises', () => {
  it('resolves as soon as the voice ends, not at the full fade duration', async () => {
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    await engine.loadSound('pad', 'mock://pad.wav', { bus: 'music' });
    const v = engine.sound('pad').play({ loop: true });

    const started = Date.now();
    const fading = v.fade({ to: 0, duration: 5 });
    setTimeout(() => v.stop({ fade: 0 }), 20);

    await fading;
    // The old setTimeout path always burned the full 5 s.
    expect(Date.now() - started).toBeLessThan(1000);
    await engine.close();
  });

  it('does not resolve while the audio clock is frozen', async () => {
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    const ctx = engine.context as FakeCtx;

    let resolved = false;
    const waiting = waitAudio(ctx, 0.05).then(() => {
      resolved = true;
    });
    // Suspending stops ctx.currentTime; the ramp stops with it.
    ctx._setState('suspended');

    await new Promise((r) => setTimeout(r, 200));
    expect(resolved).toBe(false);

    ctx._setState('running');
    await waiting;
    expect(resolved).toBe(true);
    await engine.close();
  });

  it('falls back to the wall clock on a context that was never started', async () => {
    const ctx = new AudioContext();
    const started = Date.now();
    await waitAudio(ctx, 0.02);
    expect(Date.now() - started).toBeGreaterThanOrEqual(10);
  });
});
