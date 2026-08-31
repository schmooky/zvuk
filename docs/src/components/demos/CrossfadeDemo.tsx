import { useEffect, useRef, useState } from 'react';
import type { StreamSound } from '@schmooky/zvuk';
import { SAMPLES, useDemoEngine } from './useDemoEngine';
import Waveform from './Waveform';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type Track = 'a' | 'b';

const FADE_SEC = 1.5;

/**
 * Crossfade demo. Two multi-minute music beds on the same bus, swapped with
 * a 1.5 s equal-power fade so perceived loudness stays flat across the swap.
 *
 * The beds are streamed, not decoded. Decoding three minutes of stereo audio
 * costs about 30 MB of PCM per track and a visible stall on a phone, which is
 * exactly the case `loadStream` exists for — and the demo may as well show
 * the thing the guides recommend.
 */
export default function CrossfadeDemo() {
  const { engine, state, error, unlock } = useDemoEngine({
    buses: { music: { level: 0.7 } },
    master: { headroom: -3, limiter: { threshold: -1 } },
  });
  const [active, setActive] = useState<Track | null>(null);
  const [busy, setBusy] = useState(false);
  const streams = useRef<Record<Track, StreamSound | null>>({ a: null, b: null });
  const [busNode, setBusNode] = useState<AudioNode | null>(null);

  useEffect(() => {
    return () => {
      streams.current.a?.stop();
      streams.current.b?.stop();
      streams.current = { a: null, b: null };
    };
  }, []);

  async function start(): Promise<void> {
    const e = await unlock();
    if (!e) return;
    streams.current.a = e.loadStream('musicA', [...SAMPLES.musicA], { bus: 'music' });
    streams.current.b = e.loadStream('musicB', [...SAMPLES.musicB], { bus: 'music' });
    await streams.current.a.play({ loop: true, volume: 1 });
    setActive('a');
    setBusNode(e.bus('music').output);
  }

  async function swap(): Promise<void> {
    if (!active || busy) return;
    setBusy(true);
    const next: Track = active === 'a' ? 'b' : 'a';
    const outgoing = streams.current[active];
    const incoming = streams.current[next];
    setActive(next);

    // Start the incoming bed silent, then run both legs on equal-power
    // curves: sin and cos sum to constant power, so the midpoint doesn't dip.
    await incoming?.play({ loop: true, volume: 0 });
    void incoming?.fade({ to: 1, duration: FADE_SEC, curve: 'equal-power' });
    await outgoing?.fade({ to: 0, duration: FADE_SEC, curve: 'equal-power' });
    outgoing?.pause();
    setBusy(false);
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
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">1500 ms · equal-power · streamed</span>
          </div>
          <Button variant="brand" disabled={busy} onClick={swap}>
            {busy ? 'crossfading…' : `Crossfade to music ${active === 'a' ? 'B' : 'A'}`}
          </Button>
          <p className="text-[10px] text-muted-foreground">
            <code className="font-mono text-primary">engine.loadStream(...)</code> keeps both beds out of RAM;
            two <code className="font-mono">stream.fade({`{ curve: 'equal-power' }`})</code> legs sum to constant
            power, so the swap doesn't dip in the middle.
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
