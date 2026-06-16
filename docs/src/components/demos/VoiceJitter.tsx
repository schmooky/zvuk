import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { SAMPLES, useDemoEngine } from './useDemoEngine';
import Waveform from './Waveform';

/**
 * Spam button. Each press fires a Voice with random pitch + volume jitter,
 * showing how to make stacked SFX feel organic instead of robotic.
 */
export default function VoiceJitter() {
  const { engine, state, error, unlock } = useDemoEngine({ buses: { sfx: {} } });
  const [loaded, setLoaded] = useState(false);
  const [pitchJitter, setPitchJitter] = useState(0.08);
  const [volumeJitter, setVolumeJitter] = useState(0.1);
  const [count, setCount] = useState(0);
  const [busNode, setBusNode] = useState<AudioNode | null>(null);

  async function start() {
    const e = await unlock();
    if (!e) return;
    if (!e.hasSound('hit')) {
      await e.loadSound('hit', [...SAMPLES.chip], { bus: 'sfx' });
      setLoaded(true);
    }
    setBusNode(e.bus('sfx').output);
  }

  function spam() {
    if (!engine.current || state !== 'live' || !loaded) return;
    engine.current.sound('hit').play({
      pitch: { jitter: pitchJitter },
      volume: { jitter: volumeJitter },
    });
    setCount((c) => c + 1);
  }

  return (
    <Card className="not-prose gap-4 p-5">
      {error && <div className="text-xs text-destructive">{error}</div>}
      {state === 'cold' ? (
        <Button variant="brand" size="lg" className="w-full" onClick={start}>
          Unlock &amp; load
        </Button>
      ) : (
        <>
          <Waveform audioNode={busNode} variant="bars" label="sfx bus" className="mb-3" />
          <div className="grid gap-3 md:grid-cols-2 mb-4">
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">pitch jitter</span>
              <Slider
                min={0}
                max={0.3}
                step={0.01}
                value={[pitchJitter]}
                onValueChange={([v]) => setPitchJitter(v)}
                aria-label="pitch jitter"
                className="mt-2"
              />
              <span className="font-mono text-[10px] text-muted-foreground">±{pitchJitter.toFixed(2)}</span>
            </label>
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">volume jitter</span>
              <Slider
                min={0}
                max={0.4}
                step={0.01}
                value={[volumeJitter]}
                onValueChange={([v]) => setVolumeJitter(v)}
                aria-label="volume jitter"
                className="mt-2"
              />
              <span className="font-mono text-[10px] text-muted-foreground">±{volumeJitter.toFixed(2)}</span>
            </label>
          </div>

          <Button
            variant="brand"
            size="lg"
            className="w-full active:translate-y-px"
            disabled={state !== 'live' || !loaded}
            onClick={spam}
          >
            Hit me
          </Button>
          <div className="mt-2 text-center font-mono text-[10px] text-muted-foreground">{count} voices spawned</div>
        </>
      )}
    </Card>
  );
}
