import type { FadeCurve } from '../types';

/**
 * Apply a curve-aware ramp to an AudioParam.
 *
 * - linear:        linearRampToValueAtTime
 * - easeIn/Out/InOut + equal-power: setValueCurveAtTime with sampled curve
 *
 * Existing automation is cancelled from `now` first so back-to-back fades
 * chain cleanly without summing. See `cancelAndPin` for why that cancel is
 * not a plain `cancelScheduledValues`.
 */
export function applyRamp(
  param: AudioParam,
  now: number,
  to: number,
  duration: number,
  curve: FadeCurve,
): void {
  const seconds = Math.max(0, duration);
  const from = param.value;

  cancelAndPin(param, now, from);

  if (seconds === 0) {
    schedule(param, to, () => param.setValueAtTime(to, now));
    return;
  }

  if (curve === 'linear') {
    schedule(param, to, () => param.linearRampToValueAtTime(to, now + seconds));
    return;
  }

  const samples = sampleCurve(from, to, curve, 64);
  schedule(param, to, () => param.setValueCurveAtTime(samples, now, seconds));
}

type HoldableParam = AudioParam & { cancelAndHoldAtTime?: (t: number) => void };

/**
 * Clear whatever automation is already scheduled and pin `from` at `now` so
 * the ramp that follows has a defined starting point.
 *
 * `cancelScheduledValues(now)` only drops events at or after `now`, so a
 * `setValueCurveAtTime` that started earlier survives — and any other
 * automation call landing inside that curve's window throws
 * NotSupportedError. Every non-linear curve here goes through
 * setValueCurveAtTime and equal-power is the default for `engine.crossfade`,
 * so two crossfades within one fade duration used to take the whole call
 * down. `cancelAndHoldAtTime` truncates the running curve instead. Firefox
 * still doesn't ship it, hence both paths.
 */
function cancelAndPin(param: AudioParam, now: number, from: number): void {
  const p = param as HoldableParam;
  if (typeof p.cancelAndHoldAtTime === 'function') {
    try {
      p.cancelAndHoldAtTime(now);
    } catch {
      param.cancelScheduledValues(now);
    }
  } else {
    param.cancelScheduledValues(now);
  }
  try {
    param.setValueAtTime(from, now);
  } catch {
    // `now` sits inside a curve window we couldn't truncate. The running
    // curve's own value is the starting point instead.
  }
}

/**
 * Run one scheduling call, falling back to a direct write if the platform
 * refuses it. A click is worse than nothing; an exception thrown out of
 * `voice.fade()` or `bus.fadeTo()` is worse than a click.
 */
function schedule(param: AudioParam, to: number, fn: () => void): void {
  try {
    fn();
  } catch {
    param.value = to;
  }
}

/**
 * Sample a constant-power gain ramp from `from` to `to`, for direct use with
 * `setValueCurveAtTime` (e.g. scheduled loop-crossfade segments). A rising leg
 * follows sin(t·π/2), a falling leg cos(t·π/2), so two opposing legs sum to 1.
 */
export function equalPowerCurve(from: number, to: number, n = 33): Float32Array {
  return sampleCurve(from, to, 'equal-power', n);
}

function sampleCurve(from: number, to: number, curve: FadeCurve, n: number): Float32Array {
  const out = new Float32Array(n);
  const rising = to >= from;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const eased = ease(t, curve, rising);
    out[i] = from + (to - from) * eased;
  }
  return out;
}

function ease(t: number, curve: FadeCurve, rising = true): number {
  switch (curve) {
    case 'easeIn':
      return t * t;
    case 'easeOut':
      return 1 - (1 - t) * (1 - t);
    case 'easeInOut':
      return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
    case 'equal-power': {
      // Constant-power (equal-power) crossfade. A rising leg follows the gain
      // sin(t·π/2) and a falling leg follows cos(t·π/2), so two opposing legs
      // sum to sin²+cos² = 1 — no ~3 dB loudness dip at the midpoint. Encoded
      // as an interpolation factor for `from + (to-from)·f`, the falling leg
      // becomes 1 - cos(t·π/2).
      return rising ? Math.sin((t * Math.PI) / 2) : 1 - Math.cos((t * Math.PI) / 2);
    }
    default:
      return t;
  }
}
