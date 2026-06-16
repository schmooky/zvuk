import { useEffect, useRef, useState } from 'react';
import { Compressor, type Engine } from '@schmooky/zvuk';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import CustomSoundField from './CustomSoundField';
import { SAMPLES, decodeFileToSound, useDemoEngine } from './useDemoEngine';
import Waveform from './Waveform';

export default function CompressorPlayground() {
  const { engine, state, error, setError, unlock } = useDemoEngine({
    buses: { music: { level: 0.7 } },
  });
  const compRef = useRef<Compressor | null>(null);
  const [bypass, setBypass] = useState(false);
  const [reduction, setReduction] = useState(0);
  const [busNode, setBusNode] = useState<AudioNode | null>(null);
  const [voice, setVoice] = useState<{ stop: () => void } | null>(null);
  const [customFile, setCustomFile] = useState<File | null>(null);
  const [cfg, setCfg] = useState({
    threshold: -24,
    ratio: 6,
    attack: 0.005,
    release: 0.18,
    makeupGain: 6,
  });

  async function ensureSound(e: Engine, file: File | null) {
    if (file) await decodeFileToSound(e, 'loop', file, 'music');
    else if (!e.hasSound('loop')) await e.loadSound('loop', [...SAMPLES.music], { bus: 'music' });
  }

  async function start() {
    const e = await unlock();
    if (!e) return;
    await ensureSound(e, customFile);
    if (!compRef.current) {
      compRef.current = new Compressor(e.context, cfg);
      e.bus('music').addFx(compRef.current);
    }
    if (!voice) setVoice(e.sound('loop').play({ loop: true }));
    setBusNode(e.bus('music').output);
  }

  async function handlePick(file: File | null) {
    setCustomFile(file);
    const e = engine.current;
    if (!e || e.state !== 'live') return; // picked while cold — start() will use it
    try {
      await ensureSound(e, file);
      voice?.stop();
      setVoice(e.sound('loop').play({ loop: true }));
    } catch {
      setError('Could not decode that audio file.');
    }
  }

  useEffect(() => {
    compRef.current?.applyConfig(cfg);
  }, [cfg]);

  useEffect(() => {
    if (compRef.current) compRef.current.bypassed = bypass;
  }, [bypass]);

  // Live reduction meter @ 30 Hz.
  useEffect(() => {
    if (state !== 'live') return;
    const id = setInterval(() => {
      setReduction(compRef.current?.reduction ?? 0);
    }, 33);
    return () => clearInterval(id);
  }, [state]);

  const reductionPct = Math.min(100, Math.abs(reduction) * 5);

  return (
    <Card className="not-prose gap-4 p-5">
      {error && <div className="text-xs text-destructive">{error}</div>}
      <CustomSoundField onPick={handlePick} />
      {state === 'cold' ? (
        <Button variant="brand" size="lg" className="w-full" onClick={start}>
          Unlock &amp; start music
        </Button>
      ) : (
        <>
          <Waveform audioNode={busNode} variant="bars" label="bus output (post-compressor)" />
          <div className="rounded-lg border border-border/60 bg-background/40 p-3">
            <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em]">
              <span className="text-primary">gain reduction</span>
              <span className="text-muted-foreground">{reduction.toFixed(2)} dB</span>
            </div>
            <div className="relative h-3 rounded-full bg-secondary/40 overflow-hidden">
              <div
                className="absolute inset-y-0 right-0 bg-gradient-to-l from-destructive via-brand2 to-primary transition-[width] duration-75"
                style={{ width: `${reductionPct}%` }}
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {[
              { key: 'threshold',  label: 'threshold (dB)', min: -60, max: 0,    step: 1,    fmt: (v: number) => v.toFixed(0) },
              { key: 'ratio',      label: 'ratio',          min: 1,   max: 20,   step: 0.5,  fmt: (v: number) => `${v.toFixed(1)}:1` },
              { key: 'attack',     label: 'attack (s)',     min: 0,   max: 0.5,  step: 0.001,fmt: (v: number) => v.toFixed(3) },
              { key: 'release',    label: 'release (s)',    min: 0.05,max: 1.5,  step: 0.01, fmt: (v: number) => v.toFixed(2) },
              { key: 'makeupGain', label: 'makeup (dB)',    min: -6,  max: 18,   step: 0.5,  fmt: (v: number) => v.toFixed(1) },
            ].map(({ key, label, min, max, step, fmt }) => {
              const value = cfg[key as keyof typeof cfg];
              return (
                <div key={key} className="block">
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
                    onValueChange={([v]) => setCfg((c) => ({ ...c, [key]: v }))}
                    aria-label={label}
                  />
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant={bypass ? 'outline' : 'secondary'}
              size="sm"
              className={
                bypass
                  ? 'flex-1 font-mono uppercase tracking-[0.14em] border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive'
                  : 'flex-1 font-mono uppercase tracking-[0.14em]'
              }
              onClick={() => setBypass((b) => !b)}
            >
              {bypass ? 'bypassed (a/b)' : 'engaged'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setCfg({ threshold: -24, ratio: 6, attack: 0.005, release: 0.18, makeupGain: 6 })}
            >
              reset
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
