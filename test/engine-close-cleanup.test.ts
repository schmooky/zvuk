import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/index';

type Internals = {
  busGroups: Map<string, unknown>;
  soloedBuses: Set<unknown>;
  musics: Map<string, unknown>;
};

describe('engine.close()', () => {
  it('clears bus groups, the solo set, and live music', async () => {
    const engine = createEngine({ buses: { music: {}, sfx: {} } });
    await engine.unlock();
    engine.busGroup('everything', [engine.bus('music'), engine.bus('sfx')]);
    engine.bus('music').solo();
    const music = await engine.loadMusic('theme', { loop: 'mock://loop.wav' });
    const playing = music.play();

    const inner = engine as unknown as Internals;
    expect(inner.busGroups.size).toBe(1);
    expect(inner.soloedBuses.size).toBe(1);

    await engine.close();

    expect(inner.busGroups.size).toBe(0);
    expect(inner.soloedBuses.size).toBe(0);
    expect(inner.musics.size).toBe(0);
    // The MusicVoice has to be stopped, not just dropped from the map —
    // streams already were.
    await expect(playing.ended).resolves.toBeUndefined();
  });
});
