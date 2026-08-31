import { useEffect, useRef } from 'react';
import type { AudioLevel } from '@schmooky/zvuk';

export interface MeterProps {
  /** Called each frame for a fresh reading. Return null when nothing is live. */
  read: () => AudioLevel | null;
  /** Pixel height. Default 44. */
  height?: number;
  className?: string;
  label?: string;
  /** Show the numeric peak readout. Default true. */
  readout?: boolean;
}

/** Floor of the scale. Below this the meter reads empty. */
const MIN_DB = -60;
/** Peak-hold decay, in dB per second. Broadcast meters sit around 20. */
const DECAY_DB_PER_SEC = 20;
/** Anything at or above this lights the clip indicator. */
const CLIP_DB = -0.1;
/** How long the clip indicator stays lit after the last overshoot. */
const CLIP_HOLD_MS = 1200;

function toDb(linear: number): number {
  return linear > 0 ? 20 * Math.log10(linear) : Number.NEGATIVE_INFINITY;
}

/** Position of a dB value along the scale, 0 at the floor and 1 at unity. */
function scale(db: number): number {
  if (!Number.isFinite(db)) return 0;
  return Math.max(0, Math.min(1, (db - MIN_DB) / -MIN_DB));
}

/**
 * A level meter, in decibels.
 *
 * The demos previously showed an FFT spectrum here, which looks busy and
 * tells you nothing about level: you cannot read gain staging off it, and it
 * has no unity mark. This reads `{ rms, peak }` — the shape `bus.meter()`,
 * `voice.level()` and `engine.masterMeter()` all already return, and which
 * the docs never used — and draws it the way a mixer does. RMS as the filled
 * bar, peak as a held line falling at 20 dB per second, ticks at -60 through
 * 0, a unity mark, and a clip indicator that latches.
 */
export default function Meter({ read, height = 44, className, label, readout = true }: MeterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    let raf = 0;
    let stopped = false;
    let visible = true;
    let holdDb = MIN_DB;
    let clipAt = 0;
    let last = performance.now();

    const draw = (now: number) => {
      const dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
      last = now;

      const level = read();
      const rmsDb = level ? toDb(level.rms) : Number.NEGATIVE_INFINITY;
      const peakDb = level ? toDb(level.peak) : Number.NEGATIVE_INFINITY;

      // Peak hold: jump up instantly, fall back at a fixed rate.
      holdDb = Math.max(peakDb, holdDb - DECAY_DB_PER_SEC * dt);
      if (peakDb >= CLIP_DB) clipAt = now;
      const clipped = now - clipAt < CLIP_HOLD_MS;

      const dpr = window.devicePixelRatio ?? 1;
      const cssW = canvas.clientWidth || 240;
      const cssH = canvas.clientHeight || height;
      if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
      }
      const c2d = canvas.getContext('2d');
      if (!c2d) return;

      const w = canvas.width;
      const h = canvas.height;
      const barH = Math.max(8 * dpr, h * 0.42);
      const barY = (h - barH) / 2 - 4 * dpr;
      c2d.clearRect(0, 0, w, h);

      const style = getComputedStyle(canvas);
      const ink = style.getPropertyValue('--meter-color').trim() || '#4f6cf7';
      const hot = style.getPropertyValue('--meter-hot').trim() || '#f5b301';
      const over = style.getPropertyValue('--meter-clip').trim() || '#ef4444';
      const dim = style.getPropertyValue('--meter-track').trim() || 'rgba(255,255,255,0.08)';

      c2d.fillStyle = dim;
      c2d.fillRect(0, barY, w, barH);

      // RMS fill, warming as it approaches unity.
      const rmsX = scale(rmsDb) * w;
      if (rmsX > 0) {
        const grad = c2d.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, ink);
        grad.addColorStop(scale(-12), ink);
        grad.addColorStop(scale(-3), hot);
        grad.addColorStop(1, over);
        c2d.fillStyle = grad;
        c2d.fillRect(0, barY, rmsX, barH);
      }

      // Held peak.
      if (Number.isFinite(holdDb) && holdDb > MIN_DB) {
        c2d.fillStyle = holdDb >= CLIP_DB ? over : hot;
        c2d.fillRect(Math.min(w - 2 * dpr, scale(holdDb) * w), barY, 2 * dpr, barH);
      }

      // Scale: ticks every 12 dB, plus a full-height unity mark.
      c2d.font = `${9 * dpr}px ui-monospace, monospace`;
      c2d.textBaseline = 'top';
      for (const db of [-60, -48, -36, -24, -12, -6, 0]) {
        const x = scale(db) * w;
        const unity = db === 0;
        c2d.fillStyle = unity ? over : dim;
        c2d.fillRect(Math.min(w - 1 * dpr, x), barY - (unity ? 4 * dpr : 2 * dpr), 1 * dpr, barH + (unity ? 8 * dpr : 4 * dpr));
        c2d.fillStyle = 'rgba(160,160,180,0.85)';
        const labelText = unity ? '0' : String(db);
        const tw = c2d.measureText(labelText).width;
        c2d.fillText(labelText, Math.min(w - tw, Math.max(0, x - tw / 2)), barY + barH + 6 * dpr);
      }

      // Clip indicator, latched for a beat so a single overshoot is visible.
      if (clipped) {
        c2d.fillStyle = over;
        c2d.fillRect(w - 6 * dpr, barY - 4 * dpr, 6 * dpr, barH + 8 * dpr);
      }

      if (textRef.current) {
        textRef.current.textContent = Number.isFinite(holdDb)
          ? `${holdDb > MIN_DB ? holdDb.toFixed(1) : '-inf'} dB`
          : '-inf dB';
      }

      if (!stopped && !reduced && visible) raf = requestAnimationFrame(draw);
    };

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver === 'function') {
      observer = new IntersectionObserver(
        (entries) => {
          const wasVisible = visible;
          visible = entries.some((e) => e.isIntersecting);
          if (visible && !wasVisible && !reduced) {
            last = performance.now();
            raf = requestAnimationFrame(draw);
          }
        },
        { rootMargin: '64px' },
      );
      observer.observe(canvas);
    }

    raf = requestAnimationFrame(draw);
    return () => {
      stopped = true;
      observer?.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [read, height]);

  return (
    <div className={className}>
      {(label || readout) && (
        <div className="mb-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          <span>{label}</span>
          {readout && <span ref={textRef}>-inf dB</span>}
        </div>
      )}
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={
          {
            width: '100%',
            height,
            display: 'block',
            '--meter-color': 'oklch(0.62 0.19 275)',
            '--meter-hot': 'oklch(0.80 0.15 85)',
            '--meter-clip': 'oklch(0.63 0.22 25)',
            '--meter-track': 'rgba(255,255,255,0.07)',
          } as React.CSSProperties
        }
        className="rounded-md border border-border/60 bg-background/40"
      />
    </div>
  );
}
