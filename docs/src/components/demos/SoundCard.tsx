import { useState } from 'react';
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
    <div className="not-prose rounded-xl border border-border bg-card/40 p-5 text-center">
      {error && <div className="mb-3 text-xs text-destructive">{error}</div>}
      {state === 'cold' ? (
        <button
          type="button"
          onClick={start}
          className="rounded-lg bg-gradient-to-br from-primary to-accent px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow shadow-primary/30 transition-all hover:brightness-110"
        >
          Unlock & load
        </button>
      ) : (
        <>
          <Waveform audioNode={busNode} variant="wave" className="mb-3" />
          <button
            type="button"
            onClick={play}
            disabled={state !== 'live' || !loaded}
            className="rounded-lg bg-secondary px-6 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80 disabled:opacity-40"
          >
            Play sound
          </button>
        </>
      )}
      <p className="mt-3 text-xs text-muted-foreground font-mono">engine.sound("hit").play()</p>
    </div>
  );
}
