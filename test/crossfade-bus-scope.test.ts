import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/index';

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('crossfade bus scoping', () => {
  it('only fades out `from` on the crossfade bus, not on other buses', async () => {
    const engine = createEngine({ buses: { a: {}, b: {} } });
    await engine.unlock();
    await engine.loadSound('intro', 'mock://intro.webm');
    await engine.loadSound('main', 'mock://main.webm');

    const onA = engine.sound('intro').play({ bus: 'a', loop: true });
    const onB = engine.sound('intro').play({ bus: 'b', loop: true });

    const newVoice = engine.crossfade('intro', 'main', { bus: 'a', duration: 0.03 });
    expect(newVoice.bus).toBe('a');

    await wait(80); // let the out-fade + stop complete

    const active = engine.activeVoices();
    expect(active).toContain(onB); // intro on bus b survives
    expect(active).not.toContain(onA); // intro on bus a was crossfaded out
    expect(active.some((v) => v.sourceName === 'main' && v.bus === 'a')).toBe(true);

    await engine.close();
  });
});
