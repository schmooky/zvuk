/** Longest gap between audio-clock checks while a ramp is in flight. */
const POLL_CEILING_MS = 250;

/**
 * Wait for `seconds` of audio-clock time, not wall-clock time.
 *
 * Every fade in the library used to resolve on a bare setTimeout. That
 * drifts from the ramp it is reporting on in two ways: hidden tabs throttle
 * timers to about 1 Hz, and a suspended context freezes the ramp while the
 * timer keeps counting — so `await voice.fade(...)` resolved on a fade that
 * had not happened.
 *
 * A context that isn't running has a frozen clock and no audible ramp yet
 * (nothing has been unlocked), so that case falls back to the wall clock
 * rather than never resolving.
 *
 * `until` resolves the wait early — pass a voice's `ended` so a fade
 * interrupted by stop() doesn't report for its full duration.
 */
export function waitAudio(ctx: AudioContext, seconds: number, until?: Promise<unknown>): Promise<void> {
  const target = Math.max(0, seconds);
  if (target === 0) return Promise.resolve();
  if (ctx.state !== 'running') return waitWall(target, until);

  const deadline = ctx.currentTime + target;
  return new Promise<void>((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let done = false;
    const settle = () => {
      if (done) return;
      done = true;
      if (timer != null) clearTimeout(timer);
      timer = null;
      resolve();
    };
    const check = () => {
      timer = null;
      if (done) return;
      const remaining = deadline - ctx.currentTime;
      if (remaining <= 0) {
        settle();
        return;
      }
      // Re-arm. A suspended context stalls the clock, so the wait stalls
      // with the ramp instead of resolving ahead of it.
      timer = setTimeout(check, Math.min(remaining * 1000, POLL_CEILING_MS));
    };
    if (until) void until.then(settle, settle);
    timer = setTimeout(check, target * 1000);
  });
}

function waitWall(seconds: number, until?: Promise<unknown>): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, seconds * 1000);
    if (until) {
      void until.then(
        () => {
          clearTimeout(timer);
          resolve();
        },
        () => {
          clearTimeout(timer);
          resolve();
        },
      );
    }
  });
}
