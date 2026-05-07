import { useEffect, useRef } from 'react';

export interface WaveformProps {
  /**
   * The AudioNode to visualise. Pass `engine.bus('name').output`, the master
   * input, or any other live node. When `null` the canvas stays blank — the
   * demos pass `null` until the engine is live, then the bus output once
   * the user has unlocked.
   */
  audioNode: AudioNode | null;
  /** Pixel height of the canvas. Default 56. */
  height?: number;
  /** CSS class for the canvas (border, rounding, margin, etc.). */
  className?: string;
  /**
   * Time-domain oscilloscope (`'wave'`, default) or frequency-domain bars
   * (`'bars'`). Wave reads better for FX and routing demos; bars are clearer
   * for filter sweeps.
   */
  variant?: 'wave' | 'bars';
  /** Stroke / fill color. Defaults to the page primary if not provided. */
  color?: string;
  /** Optional caption rendered above the canvas. */
  label?: string;
}

/**
 * Live waveform / spectrum visualiser. Lazily attaches an AnalyserNode to
 * `audioNode` as a passive sibling — no audio-path change. Cleans up on
 * unmount or when the source node changes.
 *
 * The component creates its own analyser instead of reading from
 * `bus.meter()` so the docs don't depend on a specific zvuk API for
 * visualisation. Same primitive, used directly.
 */
export default function Waveform({
  audioNode,
  height = 56,
  className,
  variant = 'wave',
  color,
  label,
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!audioNode) {
      const c2d = canvas.getContext('2d');
      if (c2d) c2d.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    // BaseAudioContext is the lowest type that exposes `createAnalyser`.
    const ctx = (audioNode as unknown as { context: BaseAudioContext }).context;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = variant === 'bars' ? 256 : 1024;
    analyser.smoothingTimeConstant = variant === 'bars' ? 0.85 : 0.6;
    try {
      audioNode.connect(analyser);
    } catch {
      /* destination already connected — ignore */
    }
    const timeBuf = new Float32Array(analyser.fftSize);
    const freqBuf = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;
    let stopped = false;

    const draw = (): void => {
      if (stopped) return;
      const dpr = window.devicePixelRatio ?? 1;
      const cssW = canvas.clientWidth || 320;
      const cssH = canvas.clientHeight || height;
      if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
      }
      const c2d = canvas.getContext('2d');
      if (!c2d) {
        raf = requestAnimationFrame(draw);
        return;
      }
      c2d.clearRect(0, 0, canvas.width, canvas.height);
      const stroke = color ?? (getComputedStyle(canvas).getPropertyValue('--wave-color').trim() || '#4f6cf7');

      if (variant === 'wave') {
        analyser.getFloatTimeDomainData(timeBuf as Float32Array<ArrayBuffer>);
        c2d.lineWidth = 1.5 * dpr;
        c2d.strokeStyle = stroke;
        c2d.beginPath();
        const w = canvas.width;
        const h = canvas.height;
        const step = w / timeBuf.length;
        for (let i = 0; i < timeBuf.length; i++) {
          const v = (timeBuf[i] ?? 0) * 0.95;
          const x = i * step;
          const y = (1 - v) * 0.5 * h;
          if (i === 0) c2d.moveTo(x, y);
          else c2d.lineTo(x, y);
        }
        c2d.stroke();
        // Center line for visual reference.
        c2d.strokeStyle = `${stroke}33`;
        c2d.lineWidth = 1 * dpr;
        c2d.beginPath();
        c2d.moveTo(0, h / 2);
        c2d.lineTo(w, h / 2);
        c2d.stroke();
      } else {
        analyser.getByteFrequencyData(freqBuf as Uint8Array<ArrayBuffer>);
        c2d.fillStyle = stroke;
        const w = canvas.width;
        const h = canvas.height;
        // Skip the very top of the spectrum (mostly empty for music) and
        // emphasise the lower 75% of bins where the action is.
        const usefulBins = Math.floor(freqBuf.length * 0.75);
        const barWidth = w / usefulBins;
        for (let i = 0; i < usefulBins; i++) {
          const v = (freqBuf[i] ?? 0) / 255;
          const barH = v * h;
          c2d.fillRect(i * barWidth, h - barH, Math.max(1, barWidth - 1 * dpr), barH);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      try {
        audioNode.disconnect(analyser);
      } catch {
        /* already disconnected */
      }
      try {
        analyser.disconnect();
      } catch {
        /* */
      }
    };
  }, [audioNode, variant, color, height]);

  return (
    <div className={className}>
      {label && (
        <div className="mb-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          <span>{label}</span>
          <span>{audioNode ? 'live' : 'idle'}</span>
        </div>
      )}
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height, display: 'block', '--wave-color': 'hsl(var(--primary))' } as React.CSSProperties}
        className="rounded-md border border-border/60 bg-background/40"
      />
    </div>
  );
}
