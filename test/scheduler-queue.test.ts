import { describe, expect, it } from 'vitest';
import { createEngine } from '../src/index';

type Internals = { scheduler: { tasks: unknown[] } | null };

describe('Scheduler queue', () => {
  it('keeps tasks ordered when they arrive out of order', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    const fired: number[] = [];
    const now = engine.now;
    engine.scheduleAt(now + 0.06, () => fired.push(3));
    engine.scheduleAt(now + 0.02, () => fired.push(1));
    engine.scheduleAt(now + 0.04, () => fired.push(2));

    await new Promise((r) => setTimeout(r, 200));
    expect(fired).toEqual([1, 2, 3]);
    await engine.close();
  });

  it('evicts cancelled tasks instead of holding them until a tick', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    const cancels: (() => void)[] = [];
    // All far in the future, so nothing ticks them out of the queue.
    for (let i = 0; i < 200; i++) cancels.push(engine.scheduleAt(engine.now + 600 + i, () => undefined));

    const queued = () => (engine as unknown as Internals).scheduler!.tasks.length;
    expect(queued()).toBe(200);
    for (const cancel of cancels) cancel();
    expect(queued()).toBeLessThan(200);

    await engine.close();
  });
});
