import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SAMPLES, useDemoEngine } from './useDemoEngine';
import Waveform from './Waveform';

/**
 * Single sound, single button. Demonstrates loadSound + Sound.play in
 * the smallest possible interactive form.
 */
export default function SoundCard() {
  const { engine, state, error, unlock } = useDemoEngine({ buses: { sfx: {} } });
  const [loaded, setLoaded] = useState(false);
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

  function play() {
    if (!engine.current || state !== 'live' || !loaded) return;
    engine.current.sound('hit').play();
  }

  return (
    <Card className="not-prose gap-3 p-5 text-center">
      {error && <div className="text-xs text-destructive">{error}</div>}
      {state === 'cold' ? (
        <Button variant="brand" size="sm" onClick={start}>
          Unlock &amp; load
        </Button>
      ) : (
        <>
          <Waveform audioNode={busNode} variant="bars" />
          <Button variant="secondary" size="sm" disabled={state !== 'live' || !loaded} onClick={play}>
            Play sound
          </Button>
        </>
      )}
      <p className="text-xs text-muted-foreground font-mono">engine.sound("hit").play()</p>
    </Card>
  );
}
