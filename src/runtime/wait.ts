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

  return new Promise<void>((resolve) => {
    let cancel: (() => void) | null = null;
    let done = false;
    const settle = () => {
      if (done) return;
      done = true;
      cancel?.();
      cancel = null;
      resolve();
    };
    if (until) void until.then(settle, settle);
    cancel = afterAudio(ctx, target, settle);
  });
}

/**
 * Run `fn` after `seconds` of audio-clock time. Returns a cancel function.
 *
 * Same reasoning as `waitAudio`, for the timers that drive lifecycle rather
 * than resolve a promise: a stop fade's teardown, a duration-bounded region's
 * end, a music part's handover. All three are deadlines on the audio clock,
 * and a bare `setTimeout` measures the wrong one — the engine suspends its own
 * context on every tab hide by default, which parks the audio clock while
 * timers keep counting. A voice torn down on wall time is torn down over a
 * ramp that never ran and a source that never reached its stop time.
 *
 * A context that isn't running yet has a frozen clock and nothing audible, so
 * that case falls back to the wall clock rather than never firing. A closed
 * context's clock will never advance again, so a wait on one fires instead of
 * hanging forever.
 */
export function afterAudio(ctx: AudioContext, seconds: number, fn: () => void): () => void {
  const target = Math.max(0, seconds);
  if (ctx.state !== 'running') {
    const timer = setTimeout(fn, target * 1000);
    return () => clearTimeout(timer);
  }

  const deadline = ctx.currentTime + target;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;
  const check = () => {
    timer = null;
    if (cancelled) return;
    const remaining = deadline - ctx.currentTime;
    if (remaining <= 0 || ctx.state === 'closed') {
      fn();
      return;
    }
    // Re-arm. A suspended context stalls the clock, so the wait stalls with
    // the audio instead of running ahead of it.
    timer = setTimeout(check, Math.min(remaining * 1000, POLL_CEILING_MS));
  };
  timer = setTimeout(check, target * 1000);
  return () => {
    cancelled = true;
    if (timer != null) clearTimeout(timer);
    timer = null;
  };
}
