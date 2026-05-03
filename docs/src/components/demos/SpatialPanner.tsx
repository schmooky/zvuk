import { useEffect, useRef, useState } from 'react';
import type { Voice } from '@schmooky/zvuk';
import { SAMPLES, useDemoEngine } from './useDemoEngine';

/**
 * Spatializer demo — drag (mouse, touch, stylus) to pan the looping sound.
 *
 * v0.0.2: voice.spatializer is now exposed, so we can hold the Voice and
 * setPan() on it directly instead of "logging intent" like the v0 stub did.
 *
 * Pointer events handle mouse + touch + pen in one path, so we don't have to
 * juggle separate touch handlers (and we automatically get pointer capture
 * so the puck stays glued to the finger if it drifts off the ring).
 */
export default function SpatialPanner() {
  const { engine, state, error, unlock } = useDemoEngine({ buses: { sfx: {} } });
  const [pan, setPan] = useState(0);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const voiceRef = useRef<Voice | null>(null);
  const draggingId = useRef<number | null>(null);

  async function start(): Promise<void> {
    const e = await unlock();
    if (!e) return;
    if (!e.hasSound('loop')) {
      await e.loadSound('loop', [...SAMPLES.music], { bus: 'sfx' });
    }
    voiceRef.current = e.sound('loop').play({ loop: true, spatializer: { pan: 0 } });
  }

  useEffect(() => {
    return () => {
      voiceRef.current?.stop();
      voiceRef.current = null;
    };
  }, []);

  function panFromClientX(clientX: number): number | null {
    const ring = ringRef.current;
    if (!ring) return null;
    const rect = ring.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    return Math.max(-1, Math.min(1, x * 2 - 1));
  }

  function applyPan(clientX: number): void {
    const next = panFromClientX(clientX);
    if (next == null) return;
    setPan(next);
    voiceRef.current?.spatializer?.setPan(next);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    e.preventDefault();
    const ring = ringRef.current;
    if (!ring) return;
    // Capture so we keep getting events even if the pointer drifts off the ring.
    ring.setPointerCapture(e.pointerId);
    draggingId.current = e.pointerId;
    applyPan(e.clientX);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    if (draggingId.current !== e.pointerId) return;
    applyPan(e.clientX);
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>): void {
    if (draggingId.current !== e.pointerId) return;
    const ring = ringRef.current;
    if (ring && ring.hasPointerCapture(e.pointerId)) ring.releasePointerCapture(e.pointerId);
    draggingId.current = null;
  }

  return (
    <div className="not-prose rounded-xl border border-border bg-card/40 p-5">
      {error && <div className="mb-3 text-xs text-destructive">{error}</div>}
      {state === 'cold' ? (
        <button
          type="button"
          onClick={start}
          className="w-full rounded-lg bg-gradient-to-br from-primary to-accent px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow shadow-primary/30 transition-all hover:brightness-110"
        >
          Unlock & start
        </button>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em]">
            <span className="text-primary">spatializer.pan</span>
            <span className="text-muted-foreground">{pan.toFixed(2)}</span>
          </div>
          <div
            ref={ringRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onLostPointerCapture={() => {
              draggingId.current = null;
            }}
            className="relative h-16 cursor-pointer rounded-md border border-border bg-background/60 overflow-hidden select-none touch-none"
            style={{ touchAction: 'none' }}
          >
            <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
            <div
              className="absolute top-1/2 h-8 w-8 -translate-y-1/2 -translate-x-1/2 rounded-full bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/30 transition-none"
              style={{ left: `${((pan + 1) / 2) * 100}%` }}
            />
            <div className="absolute bottom-1 left-2 font-mono text-[9px] text-muted-foreground">L</div>
            <div className="absolute bottom-1 right-2 font-mono text-[9px] text-muted-foreground">R</div>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Drag with mouse, touch, or stylus — pointer events + pointer capture handle all three. The Voice is held in a
            ref and panned via{' '}
            <code className="font-mono text-primary">voice.spatializer.setPan(next)</code>.
          </p>
        </>
      )}
    </div>
  );
}
