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
   * - `'wave'` — time-domain oscilloscope.
   * - `'bars'` — frequency-domain spectrum (default — reads well across
   *   filters, routing, fades, anything where "what's loud right now" is
   *   what you want to debug).
   * - `'bars-stereo'` — two parallel spectrum panels, one per channel.
   *   Splits `audioNode` through a `ChannelSplitterNode` so the L and R
   *   spectra are independent. Right call for spatial / panning demos
   *   where the mono sum doesn't reflect the change.
   */
  variant?: 'wave' | 'bars' | 'bars-stereo';
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

    // Stereo path: split the source into L/R channels and run an analyser
    // on each. The mono path uses a single analyser tap.
    let splitter: ChannelSplitterNode | null = null;
    let analysers: AnalyserNode[];
    let freqBufs: Uint8Array[];
    let timeBufs: Float32Array[];

    if (variant === 'bars-stereo') {
      splitter = ctx.createChannelSplitter(2);
      try {
        audioNode.connect(splitter);
      } catch {
        /* already connected */
      }
      analysers = [ctx.createAnalyser(), ctx.createAnalyser()];
      for (let ch = 0; ch < 2; ch++) {
        const a = analysers[ch]!;
        a.fftSize = 256;
        a.smoothingTimeConstant = 0.85;
        splitter.connect(a, ch);
      }
      freqBufs = analysers.map((a) => new Uint8Array(a.frequencyBinCount));
      timeBufs = analysers.map((a) => new Float32Array(a.fftSize));
    } else {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = variant === 'bars' ? 256 : 1024;
      analyser.smoothingTimeConstant = variant === 'bars' ? 0.85 : 0.6;
      try {
        audioNode.connect(analyser);
      } catch {
        /* already connected */
      }
      analysers = [analyser];
      freqBufs = [new Uint8Array(analyser.frequencyBinCount)];
      timeBufs = [new Float32Array(analyser.fftSize)];
    }

    let raf = 0;
    let stopped = false;

    const drawSpectrum = (
      c2d: CanvasRenderingContext2D,
      freqBuf: Uint8Array,
      x: number,
      y: number,
      w: number,
      h: number,
      stroke: string,
      dpr: number,
    ): void => {
      // Skip the very top of the spectrum (mostly empty for music) and
      // emphasise the lower 75% of bins where the action is.
      const usefulBins = Math.floor(freqBuf.length * 0.75);
      const barWidth = w / usefulBins;
      c2d.fillStyle = stroke;
      for (let i = 0; i < usefulBins; i++) {
        const v = (freqBuf[i] ?? 0) / 255;
        const barH = v * h;
        c2d.fillRect(x + i * barWidth, y + h - barH, Math.max(1, barWidth - 1 * dpr), barH);
      }
    };

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
        analysers[0]!.getFloatTimeDomainData(timeBufs[0] as Float32Array<ArrayBuffer>);
        const buf = timeBufs[0]!;
        c2d.lineWidth = 1.5 * dpr;
        c2d.strokeStyle = stroke;
        c2d.beginPath();
        const w = canvas.width;
        const h = canvas.height;
        const step = w / buf.length;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] ?? 0) * 0.95;
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
      } else if (variant === 'bars') {
        analysers[0]!.getByteFrequencyData(freqBufs[0] as Uint8Array<ArrayBuffer>);
        drawSpectrum(c2d, freqBufs[0]!, 0, 0, canvas.width, canvas.height, stroke, dpr);
      } else {
        // bars-stereo: half-width per channel, with a hairline divider down
        // the middle so it reads as L | R.
        analysers[0]!.getByteFrequencyData(freqBufs[0] as Uint8Array<ArrayBuffer>);
        analysers[1]!.getByteFrequencyData(freqBufs[1] as Uint8Array<ArrayBuffer>);
        const halfW = canvas.width / 2;
        const gutter = Math.max(1, Math.round(2 * dpr));
        drawSpectrum(c2d, freqBufs[0]!, 0, 0, halfW - gutter, canvas.height, stroke, dpr);
        drawSpectrum(c2d, freqBufs[1]!, halfW + gutter, 0, halfW - gutter, canvas.height, stroke, dpr);
        c2d.fillStyle = `${stroke}33`;
        c2d.fillRect(halfW - 0.5 * dpr, 0, 1 * dpr, canvas.height);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      try {
        if (splitter) audioNode.disconnect(splitter);
        else audioNode.disconnect(analysers[0]!);
      } catch {
        /* already disconnected */
      }
      try {
        splitter?.disconnect();
        for (const a of analysers) a.disconnect();
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
