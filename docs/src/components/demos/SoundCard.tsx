import { useState } from 'react';
import type { Engine } from '@schmooky/zvuk';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import CustomSoundField from './CustomSoundField';
import { SAMPLES, decodeFileToSound, useDemoEngine } from './useDemoEngine';
import Waveform from './Waveform';

/**
 * Single sound, single button. Demonstrates loadSound + Sound.play in
 * the smallest possible interactive form.
 */
export default function SoundCard() {
  const { engine, state, error, setError, unlock } = useDemoEngine({ buses: { sfx: {} } });
  const [loaded, setLoaded] = useState(false);
  const [customFile, setCustomFile] = useState<File | null>(null);
  const [busNode, setBusNode] = useState<AudioNode | null>(null);

  async function ensureSound(e: Engine, file: File | null) {
    if (file) await decodeFileToSound(e, 'hit', file, 'sfx');
    else if (!e.hasSound('hit')) await e.loadSound('hit', [...SAMPLES.chip], { bus: 'sfx' });
  }

  async function start() {
    const e = await unlock();
    if (!e) return;
    await ensureSound(e, customFile);
    setLoaded(true);
    setBusNode(e.bus('sfx').output);
  }

  async function handlePick(file: File | null) {
    setCustomFile(file);
    const e = engine.current;
    if (!e || e.state !== 'live') return; // picked while cold — start() will use it
    try {
      await ensureSound(e, file);
      setLoaded(true);
    } catch {
      setError('Could not decode that audio file.');
    }
  }

  function play() {
    if (!engine.current || state !== 'live' || !loaded) return;
    engine.current.sound('hit').play();
  }

  return (
    <Card className="not-prose gap-3 p-5 text-center">
      {error && <div className="text-xs text-destructive">{error}</div>}
      <CustomSoundField onPick={handlePick} />
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
