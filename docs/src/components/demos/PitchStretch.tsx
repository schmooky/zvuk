import { useRef, useState } from 'react';
import { StretchProcessor } from '@schmooky/zvuk';
import { SAMPLES, useDemoEngine } from './useDemoEngine';
import Waveform from './Waveform';

/**
 * Two ways to change "speed":
 *  1. PlaybackRate — cheap, alters pitch + tempo together (chipmunk effect).
 *  2. StretchProcessor — offline render, preserves pitch while changing tempo.
 *
 * Both are useful for different jobs. The demo lets you A/B them on the same
 * source so you can hear the difference.
 */
export default function PitchStretch() {
  const { engine, state, error, unlock } = useDemoEngine({ buses: { sfx: {} } });
  const sourceBufferRef = useRef<AudioBuffer | null>(null);
  const [rate, setRate] = useState(1);
  const [stretchFactor, setStretchFactor] = useState(1);
  const [stretching, setStretching] = useState(false);
  const [busNode, setBusNode] = useState<AudioNode | null>(null);

  async function start() {
    const e = await unlock();
    if (!e) return;
    if (!e.hasSound('orig')) {
      const sound = await e.loadSound('orig', [...SAMPLES.music], { bus: 'sfx' });
      // The Sound owns its buffer; for the demo we need raw access for
      // the StretchProcessor. Decode again from the same URL — the
      // engine's LRU cache makes this free.
      const url = '/audio/card-shuffle.webm';
      const res = await fetch(url);
      const ab = await res.arrayBuffer();
      sourceBufferRef.current = await e.context.decodeAudioData(ab);
      void sound;
    }
    setBusNode(e.bus('sfx').output);
  }

  function playRate() {
    if (!engine.current || state !== 'live') return;
    engine.current.sound('orig').play({ pitch: rate });
  }

  async function playStretched() {
    if (!engine.current || !sourceBufferRef.current || state !== 'live') return;
    setStretching(true);
    const e = engine.current;
    // Process off the main thread? Not yet — for v0 this is sync. ~30ms for a 1s clip.
    const stretched = StretchProcessor.stretchBuffer(e.context, sourceBufferRef.current, stretchFactor);
    if (e.hasSound('stretched')) e.removeSound('stretched');
    e.createSound('stretched', stretched, { bus: 'sfx' });
    e.sound('stretched').play();
    setStretching(false);
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
          <Waveform audioNode={busNode} variant="bars" label="bus output" className="mb-3" />
          <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-border/60 bg-background/40 p-3">
            <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
              1. playbackRate (pitch + tempo)
            </div>
            <div className="mb-2 text-[11px] text-muted-foreground">
              Cheap. The chipmunk effect.
            </div>
            <label className="block">
              <div className="flex items-center justify-between font-mono text-[10px]">
                <span className="text-muted-foreground">rate</span>
                <span className="text-primary">{rate.toFixed(2)}×</span>
              </div>
              <input
                type="range" min="0.5" max="2" step="0.05"
                value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
                className="mt-1 w-full accent-primary"
              />
            </label>
            <button
              type="button"
              onClick={playRate}
              disabled={state !== 'live'}
              className="mt-3 w-full rounded-md bg-gradient-to-br from-primary to-accent px-3 py-2 text-xs font-semibold text-primary-foreground hover:brightness-110"
            >
              play at {rate.toFixed(2)}×
            </button>
          </div>

          <div className="rounded-lg border border-accent/40 bg-background/40 p-3">
            <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
              2. StretchProcessor (preserves pitch)
            </div>
            <div className="mb-2 text-[11px] text-muted-foreground">
              Offline render. Tempo changes; pitch stays.
            </div>
            <label className="block">
              <div className="flex items-center justify-between font-mono text-[10px]">
                <span className="text-muted-foreground">factor</span>
                <span className="text-accent">{stretchFactor.toFixed(2)}×</span>
              </div>
              <input
                type="range" min="1" max="3" step="0.1"
                value={stretchFactor}
                onChange={(e) => setStretchFactor(Number(e.target.value))}
                className="mt-1 w-full accent-accent"
              />
            </label>
            <button
              type="button"
              onClick={playStretched}
              disabled={state !== 'live' || stretching}
              className="mt-3 w-full rounded-md border border-accent/60 bg-accent/10 px-3 py-2 text-xs font-semibold text-accent hover:bg-accent/20 disabled:opacity-40"
            >
              {stretching ? 'rendering…' : `render & play at ${stretchFactor.toFixed(2)}×`}
            </button>
          </div>
          </div>
        </>
      )}
    </div>
  );
}
