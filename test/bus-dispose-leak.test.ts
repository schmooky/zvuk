import { describe, expect, it } from 'vitest';
import { Bus, Compressor, createEngine, type Send } from '../src/index';

describe('Bus.dispose cleanup', () => {
  it('disposes sends + FX and accessors return copies', async () => {
    const engine = createEngine({ buses: { a: {} } });
    await engine.unlock();
    const ctx = engine.context;

    const music = new Bus(ctx, 'music');
    const verb = new Bus(ctx, 'verb');
    const send = music.send(verb);
    music.addFx(new Compressor(ctx));

    // Accessors return copies: mutating the returned array must not affect the bus.
    (music.sends() as Send[]).pop();
    (music.fx() as unknown[]).pop();
    expect(music.sends()).toHaveLength(1);
    expect(music.fx()).toHaveLength(1);

    // The send's GainNode is connected to its target before dispose.
    const sendNode = (send as unknown as { gainNode: { _connections: unknown[] } }).gainNode;
    expect(sendNode._connections.length).toBeGreaterThan(0);

    music.dispose();

    expect(music.sends()).toHaveLength(0);
    expect(music.fx()).toHaveLength(0);
    // Send torn down → its node disconnected from the target bus (no leak).
    expect(sendNode._connections).toHaveLength(0);

    await engine.close();
  });
});
