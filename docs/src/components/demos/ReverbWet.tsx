import { useEffect, useRef, useState } from 'react';
import { Reverb } from '@schmooky/zvuk';
import { SAMPLES, useDemoEngine } from './useDemoEngine';
import Waveform from './Waveform';

export default function ReverbWet() {
  const { engine, state, error, unlock } = useDemoEngine({
    buses: { music: { level: 0.7 } },
  });
  const reverbRef = useRef<Reverb | null>(null);
  const [wet, setWet] = useState(0.3);
  const [decay, setDecay] = useState(1.5);
  const [bypass, setBypass] = useState(false);
  const [busNode, setBusNode] = useState<AudioNode | null>(null);

  async function start() {
    const e = await unlock();
    if (!e) return;
    if (!e.hasSound('loop')) {
      await e.loadSound('loop', [...SAMPLES.music], { bus: 'music' });
    }
    if (!reverbRef.current) {
      reverbRef.current = new Reverb(e.context, { wet, decay: { seconds: decay } });
      e.bus('music').addFx(reverbRef.current);
    }
    e.sound('loop').play({ loop: true });
    setBusNode(e.bus('music').output);
  }

  useEffect(() => {
    reverbRef.current?.setWet(wet);
  }, [wet]);

  useEffect(() => {
    if (reverbRef.current) reverbRef.current.bypassed = bypass;
  }, [bypass]);

  // Decay length requires a fresh IR — recreate on change.
  useEffect(() => {
    if (state !== 'live' || !engine.current) return;
    if (!reverbRef.current) return;
    const e = engine.current;
    e.bus('music').removeFx(reverbRef.current);
    reverbRef.current.dispose();
    const fresh = new Reverb(e.context, { wet, decay: { seconds: decay } });
    e.bus('music').addFx(fresh);
    reverbRef.current = fresh;
    fresh.bypassed = bypass;
    // intentionally not reading wet/bypass in deps — those have their own effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decay]);

  return (
    <div className="not-prose rounded-xl border border-border bg-card/40 p-5">
      {error && <div className="mb-3 text-xs text-destructive">{error}</div>}
      {state === 'cold' ? (
        <button type="button" onClick={start} className="w-full rounded-lg bg-gradient-to-br from-primary to-accent px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow shadow-primary/30 transition-all hover:brightness-110">
          Unlock & start music
        </button>
      ) : (
        <>
          <Waveform audioNode={busNode} variant="wave" label="bus output (post-reverb)" className="mb-3" />
          <div className="grid gap-3 md:grid-cols-2 mb-4">
            <label className="block">
              <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em]">
                <span className="text-primary">wet</span>
                <span className="text-muted-foreground">{wet.toFixed(2)}</span>
              </div>
              <input type="range" min="0" max="1" step="0.01" value={wet} onChange={(e) => setWet(Number(e.target.value))} className="mt-1 w-full accent-primary" />
            </label>
            <label className="block">
              <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em]">
                <span className="text-primary">decay (s)</span>
                <span className="text-muted-foreground">{decay.toFixed(2)}</span>
              </div>
              <input type="range" min="0.2" max="4" step="0.1" value={decay} onChange={(e) => setDecay(Number(e.target.value))} className="mt-1 w-full accent-primary" />
            </label>
          </div>

          <button
            type="button"
            onClick={() => setBypass((b) => !b)}
            className={
              'w-full rounded-md border px-3 py-2 font-mono text-xs uppercase tracking-[0.14em] transition-colors ' +
              (bypass
                ? 'border-destructive/60 bg-destructive/10 text-destructive'
                : 'border-border/60 bg-secondary/30 text-foreground hover:bg-secondary/50')
            }
          >
            {bypass ? 'bypassed' : 'engaged'}
          </button>
        </>
      )}
    </div>
  );
}
