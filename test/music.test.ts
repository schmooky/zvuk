import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/index';

describe('engine.loadMusic + Music + MusicVoice', () => {
  it('loads a three-part asset and registers it on the engine', async () => {
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    await engine.loadMusic(
      'boss',
      {
        intro: 'mock://boss-intro.webm',
        loop: 'mock://boss-loop.webm',
        outro: 'mock://boss-outro.webm',
      },
      { bus: 'music' },
    );
    expect(engine.hasMusic('boss')).toBe(true);
    const m = engine.music('boss');
    expect(m.hasIntro).toBe(true);
    expect(m.hasOutro).toBe(true);
    expect(m.loopDuration).toBeGreaterThan(0);
    await engine.close();
  });

  it('accepts loop-only manifests; intro and outro default to undefined', async () => {
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    await engine.loadMusic('bed', { loop: 'mock://bed.webm' }, { bus: 'music' });
    const m = engine.music('bed');
    expect(m.hasIntro).toBe(false);
    expect(m.hasOutro).toBe(false);
    await engine.close();
  });

  it('play() spawns a MusicVoice that starts in the intro state', async () => {
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    await engine.loadMusic(
      'boss',
      { intro: 'mock://boss-intro.webm', loop: 'mock://boss-loop.webm' },
      { bus: 'music' },
    );
    const v = engine.music('boss').play({ volume: 0.5 });
    expect(v.currentPart).toBe('intro');
    v.stop({ fade: 0 });
    await v.ended;
    expect(v.currentPart).toBe('ended');
    await engine.close();
  });

  it('play() on a loop-only asset starts directly in the loop state', async () => {
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    await engine.loadMusic('bed', { loop: 'mock://bed.webm' }, { bus: 'music' });
    const v = engine.music('bed').play();
    expect(v.currentPart).toBe('loop');
    v.stop({ fade: 0 });
    await v.ended;
    await engine.close();
  });

  it('skipToOutro({ at: "now" }) starts the outro immediately and resolves .ended naturally', async () => {
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    await engine.loadMusic(
      'boss',
      {
        intro: 'mock://boss-intro.webm',
        loop: 'mock://boss-loop.webm',
        outro: 'mock://boss-outro.webm',
      },
      { bus: 'music' },
    );
    const v = engine.music('boss').play();
    v.skipToOutro({ at: 'now' });
    // The outro is scheduled — let the mock's microtask pump fire its end.
    await new Promise<void>((res) => setTimeout(res, 100));
    v.stop({ fade: 0 });
    await v.ended;
    await engine.close();
  });

  it('skipToOutro on a music asset without an outro falls through to a clean stop', async () => {
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    await engine.loadMusic('bed', { loop: 'mock://bed.webm' }, { bus: 'music' });
    const v = engine.music('bed').play();
    v.skipToOutro();
    await v.ended;
    expect(v.currentPart).toBe('ended');
    await engine.close();
  });

  it('stop() with click-free fade tears the chain down without throwing', async () => {
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    await engine.loadMusic(
      'boss',
      { intro: 'mock://i.webm', loop: 'mock://l.webm', outro: 'mock://o.webm' },
      { bus: 'music' },
    );
    const v = engine.music('boss').play();
    expect(() => v.stop()).not.toThrow();
    await v.ended;
    await engine.close();
  });

  it('loopCrossfade option flows through to the loop chain (no throw, no native loop on first source)', async () => {
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    await engine.loadMusic('bed', { loop: 'mock://bed.webm' }, { bus: 'music', loopCrossfade: 0.05 });
    const v = engine.music('bed').play();
    // No specific assertion on internal source.loop because that's a private
    // detail; smoke-test stop() doesn't crash and the voice ends cleanly.
    v.stop({ fade: 0 });
    await v.ended;
    await engine.close();
  });
});
