import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEngine, type TickSource } from '../src/index';

describe('TickSource injection', () => {
  it('subscribes lazily — only when a task is scheduled', async () => {
    let subscribed = 0;
    const handlers = new Set<() => void>();
    const tickSource: TickSource = {
      subscribe(handler) {
        subscribed += 1;
        handlers.add(handler);
        return () => handlers.delete(handler);
      },
    };

    const engine = createEngine({ buses: { sfx: {} }, tickSource });
    await engine.unlock();

    expect(subscribed).toBe(0);

    engine.scheduleAt(engine.now + 100, () => {});
    expect(subscribed).toBe(1);
    expect(handlers.size).toBe(1);

    await engine.close();
  });

  it('dispatches due tasks when the host ticker fires (no setTimeout in flight)', async () => {
    const handlers = new Set<() => void>();
    const tickSource: TickSource = {
      subscribe(handler) {
        handlers.add(handler);
        return () => handlers.delete(handler);
      },
    };

    const engine = createEngine({ buses: { sfx: {} }, tickSource });
    await engine.unlock();

    let fired = false;
    engine.scheduleAt(engine.now - 0.01, () => {
      fired = true;
    });

    expect(fired).toBe(false);
    for (const h of handlers) h();
    expect(fired).toBe(true);

    await engine.close();
  });

  it('unsubscribes from the host ticker once the task queue drains', async () => {
    const handlers = new Set<() => void>();
    let subscribed = 0;
    let unsubscribed = 0;
    const tickSource: TickSource = {
      subscribe(handler) {
        subscribed += 1;
        handlers.add(handler);
        return () => {
          unsubscribed += 1;
          handlers.delete(handler);
        };
      },
    };

    const engine = createEngine({ buses: { sfx: {} }, tickSource });
    await engine.unlock();

    engine.scheduleAt(engine.now - 0.01, () => {});
    expect(subscribed).toBe(1);
    expect(unsubscribed).toBe(0);

    for (const h of handlers) h();
    expect(unsubscribed).toBe(1);

    engine.scheduleAt(engine.now - 0.01, () => {});
    expect(subscribed).toBe(2);

    await engine.close();
  });

  it('dispose() releases the host ticker subscription', async () => {
    let active = 0;
    const tickSource: TickSource = {
      subscribe() {
        active += 1;
        return () => {
          active -= 1;
        };
      },
    };

    const engine = createEngine({ buses: { sfx: {} }, tickSource });
    await engine.unlock();
    engine.scheduleAt(engine.now + 100, () => {});
    expect(active).toBe(1);

    await engine.close();
    expect(active).toBe(0);
  });

  it('without tickSource, setTimeout still drives dispatch (legacy behaviour)', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();

    let fired = false;
    engine.scheduleAt(engine.now + 0.05, () => {
      fired = true;
    });

    await new Promise((res) => setTimeout(res, 120));
    expect(fired).toBe(true);
    await engine.close();
  });
});

describe('autoPauseOnHidden', () => {
  const visibilityListeners: EventListenerOrEventListenerObject[] = [];
  const realAdd = document.addEventListener.bind(document);

  beforeEach(() => {
    visibilityListeners.length = 0;
    document.addEventListener = vi.fn(
      (
        type: string,
        listener: EventListenerOrEventListenerObject,
        opts?: AddEventListenerOptions | boolean,
      ) => {
        if (type === 'visibilitychange') visibilityListeners.push(listener);
        return realAdd(type, listener, opts);
      },
    ) as typeof document.addEventListener;
  });

  afterEach(() => {
    document.addEventListener = realAdd;
  });

  it('attaches a visibilitychange handler by default', async () => {
    const engine = createEngine({ buses: { sfx: {} } });
    await engine.unlock();
    expect(visibilityListeners.length).toBeGreaterThan(0);
    await engine.close();
  });

  it('skips the visibilitychange handler when autoPauseOnHidden: false', async () => {
    const engine = createEngine({ buses: { sfx: {} }, autoPauseOnHidden: false });
    await engine.unlock();
    expect(visibilityListeners.length).toBe(0);
    await engine.close();
  });
});
