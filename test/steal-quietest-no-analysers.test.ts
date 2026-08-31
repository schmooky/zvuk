import { describe, expect, it, vi } from 'vitest';
import { createEngine } from '../src/index';

describe("steal: 'quietest'", () => {
  it('ranks candidates without allocating an analyser per voice', async () => {
    const engine = createEngine({
      buses: { sfx: { concurrency: { max: 3, steal: 'quietest' } } },
    });
    await engine.unlock();
    await engine.loadSound('tick', 'mock://tick.wav', { bus: 'sfx' });

    const ctx = engine.context;
    const spy = vi.spyOn(ctx, 'createAnalyser');

    const voices = [];
    for (let i = 0; i < 6; i++) voices.push(engine.sound('tick').play({ loop: true }));

    // level() keeps its AnalyserNode for the voice's lifetime, so ranking
    // with it left one permanent analyser per candidate on the graph.
    expect(spy).not.toHaveBeenCalled();
    expect(engine.bus('sfx').voiceCount).toBeLessThanOrEqual(3);

    for (const v of voices) v.stop({ fade: 0 });
    spy.mockRestore();
    await engine.close();
  });
});
