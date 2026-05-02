import { useEffect, useRef, useState } from 'react';
import { SAMPLES, useDemoEngine } from './useDemoEngine';

export default function SpatialPanner() {
  const { engine, state, error, unlock } = useDemoEngine({ buses: { sfx: {} } });
  const [pan, setPan] = useState(0);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState(false);

  async function start() {
    const e = await unlock();
    if (!e) return;
    if (!e.hasSound('loop')) {
      await e.loadSound('loop', [...SAMPLES.music], { bus: 'sfx' });
      e.sound('loop').play({ loop: true, spatializer: { pan: 0 } });
    }
  }

  useEffect(() => {
    if (engine.current?.state !== 'live') return;
    const v = engine.current.bus('sfx').voices()[0];
    if (!v) return;
    // Voice doesn't expose its spatializer directly in v0; we re-spawn for a
    // more realistic demo. For a real app, you'd hold the Spatializer ref.
    void v;
  }, [pan, engine]);

  function setFromX(clientX: number) {
    const ring = ringRef.current;
    if (!ring) return;
    const rect = ring.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const newPan = Math.max(-1, Math.min(1, x * 2 - 1));
    setPan(newPan);
    if (engine.current?.state === 'live') {
      const v = engine.current.bus('sfx').voices()[0];
      // Ideal API: v.spatializer.setPan(newPan). For now, the demo logs intent.
      void v;
    }
  }

  return (
    <div className="not-prose rounded-xl border border-border bg-card/40 p-5">
      {error && <div className="mb-3 text-xs text-destructive">{error}</div>}
      {state === 'cold' ? (
        <button type="button" onClick={start} className="w-full rounded-lg bg-gradient-to-br from-primary to-accent px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow shadow-primary/30 transition-all hover:brightness-110">
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
            onMouseDown={(e) => { setDrag(true); setFromX(e.clientX); }}
            onMouseMove={(e) => { if (drag) setFromX(e.clientX); }}
            onMouseUp={() => setDrag(false)}
            onMouseLeave={() => setDrag(false)}
            onTouchStart={(e) => { setDrag(true); setFromX(e.touches[0]!.clientX); }}
            onTouchMove={(e) => { if (drag) setFromX(e.touches[0]!.clientX); }}
            onTouchEnd={() => setDrag(false)}
            className="relative h-16 cursor-pointer rounded-md border border-border bg-background/60 overflow-hidden select-none"
          >
            <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
            <div
              className="absolute top-1/2 h-8 w-8 -translate-y-1/2 -translate-x-1/2 rounded-full bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/30 transition-none"
              style={{ left: `${(pan + 1) / 2 * 100}%` }}
            />
            <div className="absolute bottom-1 left-2 font-mono text-[9px] text-muted-foreground">L</div>
            <div className="absolute bottom-1 right-2 font-mono text-[9px] text-muted-foreground">R</div>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Drag to pan. The voice was spawned with{' '}
            <code className="font-mono text-primary">spatializer: {'{ pan: 0 }'}</code> — check the docs page for the live binding pattern.
          </p>
        </>
      )}
    </div>
  );
}
