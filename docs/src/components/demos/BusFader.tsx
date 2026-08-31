import { type AudioLevel, type Engine } from '@schmooky/zvuk';
import { useCallback, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import DemoShell from './DemoShell';
import Meter from './Meter';
import CustomSoundField from './CustomSoundField';
import { SAMPLES, decodeFileToSound, useDemoEngine } from './useDemoEngine';
import Waveform from './Waveform';

/**
 * One bus, one slider, three fade buttons, and a switch that decides whether
 * the slider goes through `bus.level` or writes the gain param raw.
 *
 * The copy used to promise you could hear a click by slamming the slider,
 * which was never true: `bus.level` ramps over 10 ms internally, so both
 * paths are smooth and the demo couldn't teach its own lesson. The raw
 * toggle is the missing half. Turn it on, slam the slider, hear the zipper.
 */
export default function BusFader() {
  const { engine, state, error, setError, unlock } = useDemoEngine({
    buses: { music: { level: 0.6 } },
  });
  const [level, setLevel] = useState(0.6);
  const [busy, setBusy] = useState(false);
  const [voice, setVoice] = useState<{ stop: () => void } | null>(null);
  const [busNode, setBusNode] = useState<AudioNode | null>(null);
  const [customFile, setCustomFile] = useState<File | null>(null);
  const [raw, setRaw] = useState(false);

  const readLevel = useCallback((): AudioLevel | null => {
    const e = engine.current;
    if (!e || e.state !== 'live') return null;
    return e.bus('music').meter();
  }, [engine]);

  /** Load the user's file if one is picked, otherwise the bundled sample. */
  async function ensureLoop(e: Engine, file: File | null) {
    if (file) await decodeFileToSound(e, 'loop', file, 'music');
    else if (!e.hasSound('loop')) await e.loadSound('loop', [...SAMPLES.music], { bus: 'music' });
  }

  async function start() {
    const e = await unlock();
    if (!e) return;
    await ensureLoop(e, customFile);
    if (!voice) {
      const v = e.sound('loop').play({ loop: true });
      setVoice(v);
    }
    setBusNode(e.bus('music').output);
  }

  async function handlePick(file: File | null) {
    setCustomFile(file);
    const e = engine.current;
    if (!e || e.state !== 'live') return; // picked while cold — start() will use it
    try {
      await ensureLoop(e, file);
      voice?.stop(); // restart so the new sound is audible immediately
      setVoice(e.sound('loop').play({ loop: true }));
    } catch {
      setError('Could not decode that audio file.');
    }
  }

  function setLevelLive(v: number) {
    setLevel(v);
    const e = engine.current;
    if (e?.state !== 'live') return;
    if (raw) {
      // What the library deliberately doesn't do: a bare AudioParam write,
      // stepping the gain once per pointer event.
      e.bus('music').output.gain.value = v;
    } else {
      e.bus('music').level = v;
    }
  }

  async function fadeTo(target: number, duration: number) {
    if (!engine.current || engine.current.state !== 'live') return;
    setBusy(true);
    await engine.current.bus('music').fadeTo(target, duration);
    setLevel(target);
    setBusy(false);
  }

  function stop() {
    voice?.stop();
    setVoice(null);
  }

  return (
    <Card className="not-prose gap-4 p-5">
      {error && <div className="text-xs text-destructive">{error}</div>}
      <CustomSoundField onPick={handlePick} />
      <DemoShell state={state} onStart={start} label="Unlock & start loop">
          <Meter read={readLevel} label="music bus" />
          <Waveform audioNode={busNode} variant="bars" label="bus output" />
          <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em]">
            <span className="text-primary">music.level</span>
            <span className="text-muted-foreground">{level.toFixed(2)}</span>
          </div>
          <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <input
              type="checkbox"
              checked={raw}
              onChange={(e) => setRaw(e.target.checked)}
              className="accent-[var(--color-primary)]"
            />
            write output.gain.value directly (no 10 ms ramp)
          </label>
          <Slider
            min={0}
            max={1}
            step={0.01}
            value={[level]}
            onValueChange={([v]) => setLevelLive(v)}
            disabled={busy}
            aria-label="music bus level"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="font-mono"
              disabled={busy || state !== 'live'}
              onClick={() => fadeTo(1, 0.6)}
            >
              fadeTo(1, 0.6)
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="font-mono"
              disabled={busy || state !== 'live'}
              onClick={() => fadeTo(0.1, 0.8)}
            >
              fadeTo(0.1, 0.8)
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="font-mono"
              disabled={busy || state !== 'live'}
              onClick={() => fadeTo(0, 1.2)}
            >
              fadeTo(0, 1.2)
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={stop}
            >
              stop voice
            </Button>
          </div>
      </DemoShell>
    </Card>
  );
}
