import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/index';

/**
 * cues() should yield 'paused' on pause(), 'resumed' on resume(), and
 * 'ended' as the terminal cue. Async iterator semantics are subtle —
 * we drive the voice through the lifecycle and collect what fires.
 */
describe('Voice.cues paused/resumed', () => {
  it('emits paused after pause() and resumed after resume()', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    await engine.loadSound('blip', 'mock://blip.wav', { bus: 'sfx' });
    const v = engine.sound('blip').play({ loop: true });

    const seen: string[] = [];
    const collect = (async () => {
      for await (const cue of v.cues()) {
        seen.push(cue);
        if (cue === 'ended') break;
      }
    })();

    // give 'started' a microtask to fire
    await Promise.resolve();
    v.pause();
    await Promise.resolve();
    v.resume();
    await Promise.resolve();
    v.stop();
    await collect;

    expect(seen).toContain('started');
    expect(seen).toContain('paused');
    expect(seen).toContain('resumed');
    expect(seen[seen.length - 1]).toBe('ended');
    await engine.close();
  });
});
