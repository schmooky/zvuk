import { useEffect, useRef, useState } from 'react';
import type { Snapshot } from '@schmooky/zvuk';
import { SAMPLES, useDemoEngine } from './useDemoEngine';
import Waveform from './Waveform';

/**
 * Two looping layers on two buses. Two snapshots capture the "calm" and
 * "combat" mix shapes. The slider drives a `tension` Parameter, which
 * subscribes to `engine.blendSnapshots(calm, combat, t)` — so dragging
 * the slider per-frame interpolates the whole mix continuously.
 */
export default function SnapshotBlend() {
  const { engine: engineRef, state, error, unlock } = useDemoEngine({
    buses: { music: { level: 0.6 }, drums: { level: 0 } },
  });

  const calmRef = useRef<Snapshot | null>(null);
  const combatRef = useRef<Snapshot | null>(null);
  const [tension, setTension] = useState(0);
  const [levels, setLevels] = useState({ music: 0.6, drums: 0 });
  const [musicNode, setMusicNode] = useState<AudioNode | null>(null);

  async function start(): Promise<void> {
    const e = await unlock();
    if (!e) return;
    if (!e.hasSound('snapblend-music')) {
      await e.loadSound('snapblend-music', [...SAMPLES.musicA], { bus: 'music' });
      await e.loadSound('snapblend-drums', [...SAMPLES.musicB], { bus: 'drums' });
    }
    e.bus('music').level = 0.6;
    e.bus('drums').level = 0;
    calmRef.current = e.captureSnapshot('calm');

    e.bus('music').level = 0.25;
    e.bus('drums').level = 0.85;
    combatRef.current = e.captureSnapshot('combat');

    e.sound('snapblend-music').play({ loop: true });
    e.sound('snapblend-drums').play({ loop: true });

    const tensionParam = e.parameter('snapblend-tension', 0);
    tensionParam.subscribe((t) => {
      if (calmRef.current && combatRef.current) {
        e.blendSnapshots(calmRef.current, combatRef.current, t);
      }
    });
    tensionParam.set(0);
    setMusicNode(e.bus('music').output);
  }

  useEffect(() => {
    if (state !== 'live') return;
    let raf = 0;
    const tick = (): void => {
      const e = engineRef.current;
      if (e) setLevels({ music: e.bus('music').level, drums: e.bus('drums').level });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [state, engineRef]);

  function setT(t: number): void {
    const e = engineRef.current;
    if (!e || !calmRef.current || !combatRef.current) return;
    e.parameter('snapblend-tension', 0).set(t);
    setTension(t);
  }

  return (
    <div className="not-prose rounded-xl border border-border bg-card/40 p-5">
      {error && <div className="mb-3 text-xs text-destructive">{error}</div>}
      {state === 'cold' ? (
        <button
          type="button"
          onClick={() => void start()}
          className="w-full rounded-lg bg-gradient-to-br from-primary to-accent px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow shadow-primary/30 transition-all hover:brightness-110"
        >
          Unlock &amp; start
        </button>
      ) : (
        <>
          <Waveform audioNode={musicNode} variant="bars" label="music bus" className="mb-3" />

          <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
            <span>tension</span>
            <span className="text-muted-foreground">t = {tension.toFixed(2)}</span>
          </div>
          <input
            aria-label="tension"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={tension}
            onChange={(ev) => setT(Number(ev.currentTarget.value))}
            className="w-full"
          />

          <div className="mt-3 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setT(0)}
              className="rounded-lg border border-border/60 bg-secondary/30 px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-secondary/50 hover:text-foreground"
            >
              calm (t=0)
            </button>
            <button
              type="button"
              onClick={() => setT(0.5)}
              className="rounded-lg border border-border/60 bg-secondary/30 px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-secondary/50 hover:text-foreground"
            >
              mid (t=0.5)
            </button>
            <button
              type="button"
              onClick={() => setT(1)}
              className="rounded-lg border border-border/60 bg-secondary/30 px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-secondary/50 hover:text-foreground"
            >
              combat (t=1)
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 font-mono text-[10px] text-muted-foreground">
            <div>
              music bus: <span className="text-primary">{levels.music.toFixed(2)}</span>
            </div>
            <div>
              drums bus: <span className="text-primary">{levels.drums.toFixed(2)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
