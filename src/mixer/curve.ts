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
  durationMs: number,
  curve: FadeCurve,
): void {
  const durationSec = Math.max(0, durationMs / 1000);
  const from = param.value;

  param.cancelScheduledValues(now);
  param.setValueAtTime(from, now);

  if (durationSec === 0) {
    param.setValueAtTime(to, now);
    return;
  }

  if (curve === 'linear') {
    param.linearRampToValueAtTime(to, now + durationSec);
    return;
  }

  const samples = sampleCurve(from, to, curve, 64);
  param.setValueCurveAtTime(samples, now, durationSec);
}

function sampleCurve(from: number, to: number, curve: FadeCurve, n: number): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const eased = ease(t, curve);
    out[i] = from + (to - from) * eased;
  }
  return out;
}

function ease(t: number, curve: FadeCurve): number {
  switch (curve) {
    case 'easeIn':
      return t * t;
    case 'easeOut':
      return 1 - (1 - t) * (1 - t);
    case 'easeInOut':
      return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
    case 'equal-power':
      // sin/cos crossfade on a single side: sin(t * pi/2)^2 → power-preserving
      return Math.sin((t * Math.PI) / 2) ** 2;
    default:
      return t;
  }
}
