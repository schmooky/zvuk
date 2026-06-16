import { useEffect, useRef, useState } from 'react';
import type { Voice } from '@schmooky/zvuk';
import { SAMPLES, useDemoEngine } from './useDemoEngine';
import Waveform from './Waveform';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

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
  const [busNode, setBusNode] = useState<AudioNode | null>(null);

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
    setBusNode(e.bus('music').output);
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
    <Card className="not-prose gap-4 p-5">
      {error && <div className="text-xs text-destructive">{error}</div>}
      {state === 'cold' ? (
        <Button variant="brand" size="lg" className="w-full" onClick={start}>
          Unlock &amp; start music A
        </Button>
      ) : (
        <div className="flex flex-col gap-3">
          <Waveform audioNode={busNode} variant="bars" label="bus output" />
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Pill on={active === 'a'}>music A</Pill>
              <Pill on={active === 'b'}>music B</Pill>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">1500 ms · equal-power</span>
          </div>
          <Button variant="brand" disabled={busy} onClick={swap}>
            {busy ? 'crossfading…' : `Crossfade to music ${active === 'a' ? 'B' : 'A'}`}
          </Button>
          <p className="text-[10px] text-muted-foreground">
            <code className="font-mono text-primary">engine.crossfade('musicA', 'musicB', {`{ duration: 1.5 }`})</code> — outgoing voices match by{' '}
            <code className="font-mono">sourceName</code> and fade out while the new voice fades in.
          </p>
        </div>
      )}
    </Card>
  );
}

function Pill({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <Badge
      variant="outline"
      className={`rounded-full font-mono text-[10px] uppercase tracking-[0.14em] ${
        on ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border bg-secondary/40 text-muted-foreground'
      }`}
    >
      {children}
    </Badge>
  );
}
