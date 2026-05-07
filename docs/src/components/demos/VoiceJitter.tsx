import { useState } from 'react';
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
    <div className="not-prose rounded-xl border border-border bg-card/40 p-5">
      {error && <div className="mb-3 text-xs text-destructive">{error}</div>}
      {state === 'cold' ? (
        <button
          type="button"
          onClick={start}
          className="w-full rounded-lg bg-gradient-to-br from-primary to-accent px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow shadow-primary/30 transition-all hover:brightness-110"
        >
          Unlock & load
        </button>
      ) : (
        <>
          <Waveform audioNode={busNode} variant="bars" label="sfx bus" className="mb-3" />
          <div className="grid gap-3 md:grid-cols-2 mb-4">
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">pitch jitter</span>
              <input
                type="range" min="0" max="0.3" step="0.01"
                value={pitchJitter}
                onChange={(e) => setPitchJitter(Number(e.target.value))}
                className="mt-1 w-full accent-primary"
              />
              <span className="font-mono text-[10px] text-muted-foreground">±{pitchJitter.toFixed(2)}</span>
            </label>
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">volume jitter</span>
              <input
                type="range" min="0" max="0.4" step="0.01"
                value={volumeJitter}
                onChange={(e) => setVolumeJitter(Number(e.target.value))}
                className="mt-1 w-full accent-primary"
              />
              <span className="font-mono text-[10px] text-muted-foreground">±{volumeJitter.toFixed(2)}</span>
            </label>
          </div>

          <button
            type="button"
            onClick={spam}
            disabled={state !== 'live' || !loaded}
            className="w-full rounded-lg bg-gradient-to-br from-primary to-accent px-4 py-3 text-sm font-semibold text-primary-foreground shadow shadow-primary/30 transition-all hover:brightness-110 active:translate-y-px"
          >
            Hit me
          </button>
          <div className="mt-2 text-center font-mono text-[10px] text-muted-foreground">{count} voices spawned</div>
        </>
      )}
    </div>
  );
}
