import { useEffect, useRef, useState } from 'react';
import { Ducker, type Engine, type Voice } from '@schmooky/zvuk';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import DemoShell from './DemoShell';
import Meter from './Meter';
import { BED_LOOP_CROSSFADE, SAMPLES, useDemoEngine } from './useDemoEngine';

/**
 * A bed on the music bus, a "voice" on the voice bus, and a Ducker on music
 * keyed from voice. Press Talk and watch the music meter dip under the voice
 * meter, then swell back over the release time.
 *
 * The voice is a phrase of pickups rather than speech, because the demo set
 * has no dialogue. What the ducker hears is level, not words, so the shape is
 * the same.
 */
const PHRASE: { at: number; sample: keyof typeof SAMPLES }[] = [
  { at: 0, sample: 'bells1' },
  { at: 0.35, sample: 'chimeQuick' },
  { at: 0.7, sample: 'gem' },
  { at: 1.05, sample: 'bells2' },
  { at: 1.5, sample: 'chime' },
];

export default function DuckerDemo() {
  const { engine, state, error, unlock } = useDemoEngine({
    buses: { music: { level: 0.7 }, voice: { level: 1 } },
  });
  const duckerRef = useRef<Ducker | null>(null);
  const bedRef = useRef<Voice | null>(null);
  const [amount, setAmount] = useState(0.7);
  const [threshold, setThreshold] = useState(0.03);
  const [bypass, setBypass] = useState(false);

  // The insert lives on the shared music bus: take it off again on unmount.
  useEffect(() => {
    return () => {
      const e = engine.current;
      const fx = duckerRef.current;
      if (e && fx) {
        try {
          e.bus('music').removeFx(fx);
        } catch {
          /* bus already gone */
        }
      }
      fx?.dispose();
      duckerRef.current = null;
    };
  }, [engine]);

  async function load(e: Engine) {
    const jobs: Promise<unknown>[] = [];
    if (!e.hasSound('duck-bed')) jobs.push(e.loadSound('duck-bed', [...SAMPLES.stream], { bus: 'music' }));
    for (const { sample } of PHRASE) {
      const name = `duck-${sample}`;
      if (!e.hasSound(name)) jobs.push(e.loadSound(name, [...SAMPLES[sample]], { bus: 'voice' }));
    }
    await Promise.all(jobs);
  }

  async function start() {
    const e = await unlock();
    if (!e) return;
    await load(e);
    if (!duckerRef.current) {
      duckerRef.current = new Ducker(e.context, e.bus('voice'), {
        amount,
        threshold,
        attack: 0.08,
        release: 0.4,
      });
      e.bus('music').addFx(duckerRef.current);
    }
    if (!bedRef.current) {
      bedRef.current = e.sound('duck-bed').play({ loop: true, loopCrossfade: BED_LOOP_CROSSFADE });
    }
  }

  function talk() {
    const e = engine.current;
    if (!e || state !== 'live') return;
    const t0 = e.now + 0.05;
    for (const { at, sample } of PHRASE) {
      e.scheduleAt(t0 + at, () => e.sound(`duck-${sample}`).play({ volume: 0.9 }));
    }
  }

  useEffect(() => {
    duckerRef.current?.setAmount(amount);
  }, [amount]);
  useEffect(() => {
    duckerRef.current?.setThreshold(threshold);
  }, [threshold]);
  useEffect(() => {
    if (duckerRef.current) duckerRef.current.bypassed = bypass;
  }, [bypass]);

  const readBus = (name: 'music' | 'voice') => () => {
    const e = engine.current;
    if (!e || e.state !== 'live') return null;
    return e.bus(name).meter();
  };

  const sliders = [
    { label: 'amount', value: amount, set: setAmount, min: 0, max: 1, step: 0.01, fmt: (v: number) => `${Math.round(v * 100)}%` },
    { label: 'threshold (rms)', value: threshold, set: setThreshold, min: 0.005, max: 0.2, step: 0.005, fmt: (v: number) => v.toFixed(3) },
  ];

  return (
    <Card className="not-prose gap-4 p-5">
      <DemoShell state={state} onStart={start} error={error} label="Unlock & start the bed">
        <div className="grid grid-cols-2 gap-3">
          <Meter read={readBus('music')} label="music (ducked)" />
          <Meter read={readBus('voice')} label="voice (key)" />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {sliders.map(({ label, value, set, min, max, step, fmt }) => (
            <div key={label}>
              <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em]">
                <span className="text-primary">{label}</span>
                <span className="text-muted-foreground">{fmt(value)}</span>
              </div>
              <Slider
                className="mt-2"
                min={min}
                max={max}
                step={step}
                value={[value]}
                onValueChange={([v]) => set(v)}
                aria-label={label}
              />
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Button variant="brand" size="sm" className="flex-1 font-mono uppercase tracking-[0.14em]" onClick={talk}>
            Talk
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 font-mono uppercase tracking-[0.14em]"
            onClick={() => setBypass((b) => !b)}
            aria-pressed={bypass}
          >
            {bypass ? 'bypassed (a/b)' : 'ducking on'}
          </Button>
        </div>
      </DemoShell>
    </Card>
  );
}
