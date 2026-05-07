import { useEffect, useRef, useState } from 'react';
import { Compressor } from '@schmooky/zvuk';
import { SAMPLES, useDemoEngine } from './useDemoEngine';
import Waveform from './Waveform';

export default function CompressorPlayground() {
  const { engine, state, error, unlock } = useDemoEngine({
    buses: { music: { level: 0.7 } },
  });
  const compRef = useRef<Compressor | null>(null);
  const [bypass, setBypass] = useState(false);
  const [reduction, setReduction] = useState(0);
  const [busNode, setBusNode] = useState<AudioNode | null>(null);
  const [cfg, setCfg] = useState({
    threshold: -24,
    ratio: 6,
    attack: 0.005,
    release: 0.18,
    makeupGain: 6,
  });

  async function start() {
    const e = await unlock();
    if (!e) return;
    if (!e.hasSound('loop')) {
      await e.loadSound('loop', [...SAMPLES.music], { bus: 'music' });
    }
    if (!compRef.current) {
      compRef.current = new Compressor(e.context, cfg);
      e.bus('music').addFx(compRef.current);
    }
    e.sound('loop').play({ loop: true });
    setBusNode(e.bus('music').output);
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
    <div className="not-prose rounded-xl border border-border bg-card/40 p-5">
      {error && <div className="mb-3 text-xs text-destructive">{error}</div>}
      {state === 'cold' ? (
        <button
          type="button"
          onClick={start}
          className="w-full rounded-lg bg-gradient-to-br from-primary to-accent px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow shadow-primary/30 transition-all hover:brightness-110"
        >
          Unlock & start music
        </button>
      ) : (
        <>
          <Waveform audioNode={busNode} variant="bars" label="bus output (post-compressor)" className="mb-3" />
          <div className="mb-4 rounded-lg border border-border/60 bg-background/40 p-3">
            <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em]">
              <span className="text-primary">gain reduction</span>
              <span className="text-muted-foreground">{reduction.toFixed(2)} dB</span>
            </div>
            <div className="relative h-3 rounded-full bg-secondary/40 overflow-hidden">
              <div
                className="absolute inset-y-0 right-0 bg-gradient-to-l from-destructive via-accent to-primary transition-[width] duration-75"
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
                <label key={key} className="block">
                  <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em]">
                    <span className="text-primary">{label}</span>
                    <span className="text-muted-foreground">{fmt(value)}</span>
                  </div>
                  <input
                    type="range" min={min} max={max} step={step} value={value}
                    onChange={(e) => setCfg((c) => ({ ...c, [key]: Number(e.target.value) }))}
                    className="mt-1 w-full accent-primary"
                  />
                </label>
              );
            })}
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setBypass((b) => !b)}
              className={
                'flex-1 rounded-md border px-3 py-2 font-mono text-xs uppercase tracking-[0.14em] transition-colors ' +
                (bypass
                  ? 'border-destructive/60 bg-destructive/10 text-destructive'
                  : 'border-border/60 bg-secondary/30 text-foreground hover:bg-secondary/50')
              }
            >
              {bypass ? 'bypassed (a/b)' : 'engaged'}
            </button>
            <button
              type="button"
              onClick={() => setCfg({ threshold: -24, ratio: 6, attack: 0.005, release: 0.18, makeupGain: 6 })}
              className="rounded-md border border-border/60 bg-secondary/30 px-3 py-2 text-xs hover:bg-secondary/50"
            >
              reset
            </button>
          </div>
        </>
      )}
    </div>
  );
}
