import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/index';

describe('Voice.cues attached after completion', () => {
  it('still yields the terminal ended cue', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    await engine.loadSound('s', 'mock://s.webm', { bus: 'sfx' });
    const v = engine.sound('s').play({ bus: 'sfx' });

    v.stop({ fade: 0 }); // finishes synchronously
    await v.ended;

    const seen: string[] = [];
    for await (const cue of v.cues()) seen.push(cue);

    // Previously this was an empty stream; a late consumer must still see 'ended'.
    expect(seen).toEqual(['ended']);

    await engine.close();
  });
});
