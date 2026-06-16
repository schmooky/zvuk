import { type Engine, StretchProcessor } from '@schmooky/zvuk';
import { useRef, useState } from 'react';
import { SAMPLES, decodeFileToSound, useDemoEngine } from './useDemoEngine';
import Waveform from './Waveform';
import CustomSoundField from './CustomSoundField';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';

/**
 * Two ways to change "speed":
 *  1. PlaybackRate — cheap, alters pitch + tempo together (chipmunk effect).
 *  2. StretchProcessor — offline render, preserves pitch while changing tempo.
 *
 * Both are useful for different jobs. The demo lets you A/B them on the same
 * source so you can hear the difference.
 */
export default function PitchStretch() {
  const { engine, state, error, setError, unlock } = useDemoEngine({ buses: { sfx: {} } });
  const sourceBufferRef = useRef<AudioBuffer | null>(null);
  const [rate, setRate] = useState(1);
  const [stretchFactor, setStretchFactor] = useState(1);
  const [stretching, setStretching] = useState(false);
  const [busNode, setBusNode] = useState<AudioNode | null>(null);
  const [customFile, setCustomFile] = useState<File | null>(null);

  /**
   * Load the A/B source. The StretchProcessor needs raw sample access, so we
   * keep the decoded AudioBuffer in a ref. For a custom file `decodeFileToSound`
   * hands us the buffer directly; for the bundled sample we decode the URL.
   */
  async function loadSource(e: Engine, file: File | null) {
    if (file) {
      sourceBufferRef.current = await decodeFileToSound(e, 'orig', file, 'sfx');
    } else {
      await e.loadSound('orig', [...SAMPLES.music], { bus: 'sfx' });
      const res = await fetch('/audio/card-shuffle.webm');
      sourceBufferRef.current = await e.context.decodeAudioData(await res.arrayBuffer());
    }
  }

  async function start() {
    const e = await unlock();
    if (!e) return;
    await loadSource(e, customFile);
    setBusNode(e.bus('sfx').output);
  }

  async function handlePick(file: File | null) {
    setCustomFile(file);
    const e = engine.current;
    if (!e || e.state !== 'live') return; // picked while cold — start() will use it
    try {
      if (e.hasSound('stretched')) e.removeSound('stretched');
      await loadSource(e, file);
    } catch {
      setError('Could not decode that audio file.');
    }
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
    <Card className="not-prose gap-4 p-5">
      {error && <div className="text-xs text-destructive">{error}</div>}
      <CustomSoundField onPick={handlePick} label="A/B your own sound" />
      {state === 'cold' ? (
        <Button variant="brand" size="lg" className="w-full" onClick={start}>
          Unlock &amp; load
        </Button>
      ) : (
        <>
          <Waveform audioNode={busNode} variant="bars" label="bus output" />
          <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-border/60 bg-background/40 p-3">
            <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
              1. playbackRate (pitch + tempo)
            </div>
            <div className="mb-2 text-[11px] text-muted-foreground">
              Cheap. The chipmunk effect.
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between font-mono text-[10px]">
                <span className="text-muted-foreground">rate</span>
                <span className="text-primary">{rate.toFixed(2)}×</span>
              </div>
              <Slider
                min={0.5}
                max={2}
                step={0.05}
                value={[rate]}
                onValueChange={([v]) => setRate(v)}
                aria-label="rate"
              />
            </div>
            <Button
              variant="brand"
              size="sm"
              className="mt-3 w-full"
              onClick={playRate}
              disabled={state !== 'live'}
            >
              play at {rate.toFixed(2)}×
            </Button>
          </div>

          <div className="rounded-lg border border-warning/40 bg-background/40 p-3">
            <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-warning">
              2. StretchProcessor (preserves pitch)
            </div>
            <div className="mb-2 text-[11px] text-muted-foreground">
              Offline render. Tempo changes; pitch stays.
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between font-mono text-[10px]">
                <span className="text-muted-foreground">factor</span>
                <span className="text-warning">{stretchFactor.toFixed(2)}×</span>
              </div>
              <Slider
                min={1}
                max={3}
                step={0.1}
                value={[stretchFactor]}
                onValueChange={([v]) => setStretchFactor(v)}
                aria-label="factor"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 w-full border-warning/60 bg-warning/10 text-warning hover:bg-warning/20 hover:text-warning"
              onClick={playStretched}
              disabled={state !== 'live' || stretching}
            >
              {stretching ? 'rendering…' : `render & play at ${stretchFactor.toFixed(2)}×`}
            </Button>
          </div>
          </div>
        </>
      )}
    </Card>
  );
}
