import { useEffect, useRef, useState } from 'react';
import type { Snapshot } from '@schmooky/zvuk';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
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
    <Card className="not-prose gap-4 p-5">
      {error && <div className="text-xs text-destructive">{error}</div>}
      {state === 'cold' ? (
        <Button variant="brand" size="lg" className="w-full" onClick={() => void start()}>
          Unlock &amp; start
        </Button>
      ) : (
        <>
          <Waveform audioNode={musicNode} variant="bars" label="music bus" className="mb-3" />

          <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
            <span>tension</span>
            <span className="text-muted-foreground">t = {tension.toFixed(2)}</span>
          </div>
          <Slider
            aria-label="tension"
            min={0}
            max={1}
            step={0.01}
            value={[tension]}
            onValueChange={([v]) => setT(v)}
          />

          <div className="grid grid-cols-3 gap-2">
            <Button variant="secondary" size="sm" className="font-mono" onClick={() => setT(0)}>
              calm (t=0)
            </Button>
            <Button variant="secondary" size="sm" className="font-mono" onClick={() => setT(0.5)}>
              mid (t=0.5)
            </Button>
            <Button variant="secondary" size="sm" className="font-mono" onClick={() => setT(1)}>
              combat (t=1)
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2 font-mono text-[10px] text-muted-foreground">
            <div>
              music bus: <span className="text-primary">{levels.music.toFixed(2)}</span>
            </div>
            <div>
              drums bus: <span className="text-primary">{levels.drums.toFixed(2)}</span>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
