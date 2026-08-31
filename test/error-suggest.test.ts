import { describe, expect, it } from 'vitest';
import { BusNotFoundError, createEngine, SoundNotFoundError } from '../src/index';

describe('did-you-mean error messages', () => {
  it('suggests a close bus name', async () => {
    const engine = createEngine({ buses: { music: {}, sfx: {}, voice: {} } });
    await engine.unlock();
    try {
      // Cast: branded BusName would reject this typo at compile time, but
      // the test exists to exercise the runtime "did you mean" message.
      engine.bus('sxf' as 'music' | 'sfx' | 'voice');
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(BusNotFoundError);
      expect((e as Error).message).toContain('Did you mean "sfx"');
    }
    await engine.close();
  });

  it('suggests a close sound name', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    await engine.loadSound('coin', 'mock://coin.wav', { bus: 'sfx' });
    try {
      engine.sound('coib');
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(SoundNotFoundError);
      expect((e as Error).message).toContain('Did you mean "coin"');
    }
    await engine.close();
  });

  it('does not suggest a name that is too far away', async () => {
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    try {
      engine.bus('xyz' as 'music');
    } catch (e) {
      expect((e as Error).message).not.toContain('did you mean');
    }
    await engine.close();
  });
});
