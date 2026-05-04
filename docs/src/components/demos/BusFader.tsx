import { useState } from 'react';
import { SAMPLES, useDemoEngine } from './useDemoEngine';

/**
 * One bus, one slider, two buttons. Direct level write vs. fadeTo() — you
 * can hear the click-vs-smooth difference if you slam the slider.
 */
export default function BusFader() {
  const { engine, state, error, unlock } = useDemoEngine({
    buses: { music: { level: 0.6 } },
  });
  const [level, setLevel] = useState(0.6);
  const [busy, setBusy] = useState(false);
  const [voice, setVoice] = useState<{ stop: () => void } | null>(null);

  async function start() {
    const e = await unlock();
    if (!e) return;
    if (!e.hasSound('loop')) {
      await e.loadSound('loop', [...SAMPLES.music], { bus: 'music' });
    }
    if (!voice) {
      const v = e.sound('loop').play({ loop: true });
      setVoice(v);
    }
  }

  function setLevelLive(v: number) {
    setLevel(v);
    if (engine.current?.state === 'live') engine.current.bus('music').level = v;
  }

  async function fadeTo(target: number, duration: number) {
    if (!engine.current || engine.current.state !== 'live') return;
    setBusy(true);
    await engine.current.bus('music').fadeTo(target, duration);
    setLevel(target);
    setBusy(false);
  }

  function stop() {
    voice?.stop();
    setVoice(null);
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
          Unlock & start loop
        </button>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em]">
            <span className="text-primary">music.level</span>
            <span className="text-muted-foreground">{level.toFixed(2)}</span>
          </div>
          <input
            type="range" min="0" max="1" step="0.01"
            value={level}
            onChange={(e) => setLevelLive(Number(e.target.value))}
            className="w-full accent-primary"
            disabled={busy}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={busy || state !== 'live'} onClick={() => fadeTo(1, 0.6)} className="rounded-md border border-border/60 bg-secondary/40 px-3 py-1.5 text-xs hover:bg-secondary/70 disabled:opacity-40">fadeTo(1, 0.6)</button>
            <button type="button" disabled={busy || state !== 'live'} onClick={() => fadeTo(0.1, 0.8)} className="rounded-md border border-border/60 bg-secondary/40 px-3 py-1.5 text-xs hover:bg-secondary/70 disabled:opacity-40">fadeTo(0.1, 0.8)</button>
            <button type="button" disabled={busy || state !== 'live'} onClick={() => fadeTo(0, 1.2)} className="rounded-md border border-border/60 bg-secondary/40 px-3 py-1.5 text-xs hover:bg-secondary/70 disabled:opacity-40">fadeTo(0, 1.2)</button>
            <button type="button" onClick={stop} className="ml-auto rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/20">stop voice</button>
          </div>
        </>
      )}
    </div>
  );
}
