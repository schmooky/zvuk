import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/index';

describe('scheduleAt', () => {
  it('fires a scheduled callback after the audio time elapses', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();

    const fired: number[] = [];
    const start = engine.now;
    engine.scheduleAt(start + 0.05, () => fired.push(engine.now));

    await new Promise((res) => setTimeout(res, 120));
    expect(fired.length).toBe(1);

    await engine.close();
  });

  it('cancels pending tasks via the returned disposer', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();

    let fired = false;
    const cancel = engine.scheduleAt(engine.now + 0.05, () => {
      fired = true;
    });
    cancel();
    await new Promise((res) => setTimeout(res, 100));
    expect(fired).toBe(false);

    await engine.close();
  });
});
