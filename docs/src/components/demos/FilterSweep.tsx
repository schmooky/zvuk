import { useEffect, useRef, useState } from 'react';
import { Filter, type FilterKind } from '@schmooky/zvuk';
import { SAMPLES, useDemoEngine } from './useDemoEngine';

export default function FilterSweep() {
  const { engine, state, error, unlock } = useDemoEngine({
    buses: { music: { level: 0.7 } },
  });
  const filterRef = useRef<Filter | null>(null);
  const [type, setType] = useState<FilterKind>('lowpass');
  const [freq, setFreq] = useState(1200);
  const [q, setQ] = useState(1);

  async function start() {
    const e = await unlock();
    if (!e) return;
    if (!e.hasSound('loop')) {
      await e.loadSound('loop', [...SAMPLES.music], { bus: 'music' });
    }
    if (!filterRef.current) {
      filterRef.current = new Filter(e.context, { type, frequency: freq, q });
      e.bus('music').addFx(filterRef.current);
    }
    e.sound('loop').play({ loop: true });
  }

  useEffect(() => { filterRef.current?.setType(type); }, [type]);
  useEffect(() => { filterRef.current?.setFrequency(freq); }, [freq]);
  useEffect(() => { filterRef.current?.setQ(q); }, [q]);

  return (
    <div className="not-prose rounded-xl border border-border bg-card/40 p-5">
      {error && <div className="mb-3 text-xs text-destructive">{error}</div>}
      {state === 'cold' ? (
        <button type="button" onClick={start} className="w-full rounded-lg bg-gradient-to-br from-primary to-accent px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow shadow-primary/30 transition-all hover:brightness-110">
          Unlock & start music
        </button>
      ) : (
        <>
          <label className="block mb-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">type</div>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as FilterKind)}
              className="mt-1 w-full rounded-md border border-border/60 bg-background/60 px-2 py-1.5 font-mono text-xs"
            >
              <option value="lowpass">lowpass</option>
              <option value="highpass">highpass</option>
              <option value="bandpass">bandpass</option>
              <option value="notch">notch</option>
              <option value="peaking">peaking</option>
              <option value="allpass">allpass</option>
            </select>
          </label>

          <label className="block mb-3">
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em]">
              <span className="text-primary">frequency (Hz)</span>
              <span className="text-muted-foreground">{Math.round(freq)}</span>
            </div>
            <input
              type="range" min="40" max="20000" step="10"
              value={freq}
              onChange={(e) => setFreq(Number(e.target.value))}
              className="mt-1 w-full accent-primary"
            />
          </label>

          <label className="block">
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em]">
              <span className="text-primary">Q</span>
              <span className="text-muted-foreground">{q.toFixed(2)}</span>
            </div>
            <input
              type="range" min="0.1" max="20" step="0.1"
              value={q}
              onChange={(e) => setQ(Number(e.target.value))}
              className="mt-1 w-full accent-primary"
            />
          </label>
        </>
      )}
    </div>
  );
}
