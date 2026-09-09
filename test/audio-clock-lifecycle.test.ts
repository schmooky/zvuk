import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEngine } from '../src/index';

/**
 * Third member of the same family, from the other direction: a deadline that
 * belongs to the audio clock, tracked on the wall clock.
 *
 * The engine suspends its own AudioContext whenever the tab is hidden —
 * `autoPauseOnHidden` is on by default — which freezes the audio clock while
 * `setTimeout` keeps counting. Every lifecycle timeout sized in audio seconds
 * therefore fires on a ramp that has not happened and a source that has not
 * reached its stop time. `waitAudio` exists because of this, and `voice.fade()`
 * already uses it; the timers that end voices did not.
 */

/** Hide the tab: the audio clock parks, the wall clock keeps going. */
function suspend(engine: { context: AudioContext }): void {
  (engine.context as unknown as { _setState: (s: string) => void })._setState('suspended');
}

function resume(engine: { context: AudioContext }): void {
  (engine.context as unknown as { _setState: (s: string) => void })._setState('running');
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function engineWithSound() {
  const engine = createEngine({ buses: { sfx: {} } });
  await engine.unlock();
  await engine.loadSound('hit', 'mock://hit.webm', { bus: 'sfx' });
  return engine;
}

describe('voice lifecycle runs on the audio clock', () => {
  it('does not report a fade-out as finished while the context is suspended', async () => {
    const engine = await engineWithSound();
    const v = engine.sound('hit').play();

    let ended = false;
    void v.ended.then(() => {
      ended = true;
    });

    v.stop({ fade: 0.5 });
    // Tab hidden one tick into the fade. The gain ramp and the source's
    // scheduled stop are both frozen from here.
    await vi.advanceTimersByTimeAsync(50);
    suspend(engine);

    // Four fade lengths of wall time go by with the audio clock parked.
    await vi.advanceTimersByTimeAsync(2000);
    expect(ended).toBe(false);

    // Back on screen: the remaining 450 ms of ramp actually happens, and only
    // then is the voice finished.
    resume(engine);
    await vi.advanceTimersByTimeAsync(600);
    expect(ended).toBe(true);

    await engine.close();
  });

  it('does not cut a duration-bounded region short across a tab hide', async () => {
    const engine = await engineWithSound();
    // A sprite-style region: nothing on the audio thread bounds it, so the
    // region timer is the only thing that ends it.
    const v = engine.sound('hit').play({ offset: 0, duration: 0.4 });

    let ended = false;
    void v.ended.then(() => {
      ended = true;
    });

    await vi.advanceTimersByTimeAsync(200);
    suspend(engine);
    // Half the region is still unplayed. However long the tab stays hidden,
    // that half is still owed.
    await vi.advanceTimersByTimeAsync(3000);
    expect(ended).toBe(false);

    resume(engine);
    await vi.advanceTimersByTimeAsync(400);
    expect(ended).toBe(true);

    await engine.close();
  });

  it('still finishes a fade-out when the context is closed mid-ramp', async () => {
    // A closed context's clock never advances again, so waiting on it would
    // wait forever. `.ended` has to settle rather than hang.
    const engine = await engineWithSound();
    const v = engine.sound('hit').play();

    let ended = false;
    void v.ended.then(() => {
      ended = true;
    });

    v.stop({ fade: 0.5 });
    await vi.advanceTimersByTimeAsync(50);
    await engine.close();
    await vi.advanceTimersByTimeAsync(1000);
    expect(ended).toBe(true);
  });
});

describe('music lifecycle runs on the audio clock', () => {
  it('does not report a fade-out as finished while the context is suspended', async () => {
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    await engine.loadMusic('bed', { loop: 'mock://bed.webm' }, { bus: 'music' });
    const m = engine.music('bed').play();

    let ended = false;
    void m.ended.then(() => {
      ended = true;
    });

    m.stop({ fade: 0.5 });
    await vi.advanceTimersByTimeAsync(50);
    suspend(engine);
    await vi.advanceTimersByTimeAsync(2000);
    expect(ended).toBe(false);

    resume(engine);
    await vi.advanceTimersByTimeAsync(600);
    expect(ended).toBe(true);

    await engine.close();
  });
});
