import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import DemoShell from './DemoShell';
import { SAMPLES, useDemoEngine } from './useDemoEngine';
import Waveform from './Waveform';

/**
 * Three-reel slot machine recipe. Demonstrates layered SFX, audio-clock
 * scheduling, jittered pitch, and bus mixing in one cohesive demo.
 */
export default function SlotReel() {
  const { engine, state, error, unlock } = useDemoEngine({
    buses: {
      music: { level: 0.5 },
      sfx: { level: 1.0, concurrency: { max: 12, steal: 'oldest' } },
    },
  });
  const [loaded, setLoaded] = useState(false);
  const [spinning, setSpinning] = useState<boolean[]>([false, false, false]);
  const [busNode, setBusNode] = useState<AudioNode | null>(null);

  async function start() {
    const e = await unlock();
    if (!e) return;
    await Promise.all([
      e.loadSound('reel-spin', [...SAMPLES.diceShake2], { bus: 'sfx' }),
      e.loadSound('reel-stop', [...SAMPLES.chips1], { bus: 'sfx' }),
      e.loadSound('reel-tick', [...SAMPLES.chips2], { bus: 'sfx' }),
      e.loadSound('win-sting', [...SAMPLES.chime], { bus: 'sfx' }),
    ]);
    setLoaded(true);
    setBusNode(e.bus('sfx').output);
  }

  function spin() {
    if (!engine.current || state !== 'live' || !loaded) return;
    const e = engine.current;
    setSpinning([true, true, true]);

    // Spin start whoosh.
    e.sound('reel-spin').play({ pitch: { jitter: 0.05 } });

    // Tick sounds during spin.
    for (let t = 0; t < 1.6; t += 0.12) {
      e.scheduleAt(e.now + t, () => {
        e.sound('reel-tick').play({ volume: 0.5, pitch: { jitter: 0.08 } });
      });
    }

    // Reels stop staggered.
    [1.0, 1.4, 1.8].forEach((delay, i) => {
      e.scheduleAt(e.now + delay, () => {
        e.sound('reel-stop').play({ pitch: { jitter: 0.06 } });
        setSpinning((prev) => prev.map((s, idx) => (idx === i ? false : s)));
      });
    });

    // Win sting.
    e.scheduleAt(e.now + 2.1, () => {
      e.sound('win-sting').play({ volume: 0.9 });
    });
  }

  return (
    <Card className="not-prose gap-4 p-5">
      {error && <div className="text-xs text-destructive">{error}</div>}
      <DemoShell state={state} onStart={start} label="Unlock & load reels">
          <Waveform audioNode={busNode} variant="bars" label="sfx bus" className="mb-3" />
          <div className="mb-4 grid grid-cols-3 gap-2">
            {spinning.map((s, i) => (
              <div
                key={i}
                className={
                  'flex h-24 items-center justify-center rounded-lg border text-3xl font-mono ' +
                  (s
                    ? 'border-primary bg-primary/10 animate-pulse-slow text-primary'
                    : 'border-border/60 bg-background/40 text-foreground')
                }
              >
                {s ? '◢◤' : '★'}
              </div>
            ))}
          </div>
          <Button
            variant="brand"
            size="lg"
            className="w-full active:translate-y-px disabled:opacity-40"
            disabled={state !== 'live' || !loaded || spinning.some(Boolean)}
            onClick={spin}
          >
            Spin
          </Button>
          <p className="mt-3 text-[10px] text-muted-foreground font-mono">
            scheduleAt(t) × 5 — start whoosh, ticks, three staggered stops, win sting
          </p>
      </DemoShell>
    </Card>
  );
}
