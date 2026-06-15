import type { FadeCurve } from '../types';

/**
 * Apply a curve-aware ramp to an AudioParam.
 *
 * - linear:        linearRampToValueAtTime
 * - easeIn/Out/InOut + equal-power: setValueCurveAtTime with sampled curve
 *
 * The function cancels scheduled values from `now` first so back-to-back
 * fades chain cleanly without summing.
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

  param.cancelScheduledValues(now);
  param.setValueAtTime(from, now);

  if (seconds === 0) {
    param.setValueAtTime(to, now);
    return;
  }

  if (curve === 'linear') {
    param.linearRampToValueAtTime(to, now + seconds);
    return;
  }

  const samples = sampleCurve(from, to, curve, 64);
  param.setValueCurveAtTime(samples, now, seconds);
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
