import { useEffect, useRef, useState } from 'react';
import type { Voice } from '@schmooky/zvuk';
import { SAMPLES, useDemoEngine } from './useDemoEngine';

type Track = 'a' | 'b';

/**
 * Crossfade demo. Two music beds (musicA / musicB) preloaded into the same
 * bus; clicking "Swap track" calls engine.crossfade() with a 1.5s equal-power
 * fade so the perceived loudness stays flat across the swap.
 */
export default function CrossfadeDemo() {
  const { engine, state, error, unlock } = useDemoEngine({
    buses: { music: { level: 0.7 } },
    master: { headroom: -3, limiter: { threshold: -1 } },
  });
  const [active, setActive] = useState<Track | null>(null);
  const [busy, setBusy] = useState(false);
  const voiceRef = useRef<Voice | null>(null);

  useEffect(() => {
    return () => {
      voiceRef.current?.stop();
      voiceRef.current = null;
    };
  }, []);

  async function start(): Promise<void> {
    const e = await unlock();
    if (!e) return;
    if (!e.hasSound('musicA')) await e.loadSound('musicA', [...SAMPLES.musicA], { bus: 'music' });
    if (!e.hasSound('musicB')) await e.loadSound('musicB', [...SAMPLES.musicB], { bus: 'music' });
    voiceRef.current = e.sound('musicA').play({ loop: true });
    setActive('a');
  }

  async function swap(): Promise<void> {
    const e = engine.current;
    if (!e || !active) return;
    setBusy(true);
    const next: Track = active === 'a' ? 'b' : 'a';
    voiceRef.current = e.crossfade(active === 'a' ? 'musicA' : 'musicB', next === 'a' ? 'musicA' : 'musicB', {
      duration: 1.5,
      loop: true,
    });
    setActive(next);
    // Wait for the fade to settle before re-enabling.
    setTimeout(() => setBusy(false), 1500);
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
          Unlock & start music A
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Pill on={active === 'a'}>music A</Pill>
              <Pill on={active === 'b'}>music B</Pill>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">1500 ms · equal-power</span>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={swap}
            className="rounded-lg bg-gradient-to-br from-primary to-accent px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow shadow-primary/30 transition-all hover:brightness-110 disabled:opacity-50"
          >
            {busy ? 'crossfading…' : `Crossfade to music ${active === 'a' ? 'B' : 'A'}`}
          </button>
          <p className="text-[10px] text-muted-foreground">
            <code className="font-mono text-primary">engine.crossfade('musicA', 'musicB', {`{ duration: 1.5 }`})</code> — outgoing voices match by{' '}
            <code className="font-mono">sourceName</code> and fade out while the new voice fades in.
          </p>
        </div>
      )}
    </div>
  );
}

function Pill({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] ${
        on ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border bg-secondary/40 text-muted-foreground'
      }`}
    >
      {children}
    </span>
  );
}
