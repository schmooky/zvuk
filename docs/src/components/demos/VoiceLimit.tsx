import { useEffect, useState } from 'react';
import type { ConcurrencyConfig } from '@schmooky/zvuk';
import { SAMPLES, useDemoEngine } from './useDemoEngine';

type Strategy = NonNullable<ConcurrencyConfig['steal']>;

export default function VoiceLimit() {
  const { engine, state, error, unlock } = useDemoEngine({
    buses: { sfx: { concurrency: { max: 4, steal: 'oldest' } } },
  });
  const [loaded, setLoaded] = useState(false);
  const [max, setMax] = useState(4);
  const [strategy, setStrategy] = useState<Strategy>('oldest');
  const [active, setActive] = useState(0);
  const [spawnedTotal, setSpawnedTotal] = useState(0);

  async function start() {
    const e = await unlock();
    if (!e) return;
    if (!e.hasSound('loop')) {
      await e.loadSound('loop', [...SAMPLES.music], { bus: 'sfx' });
      setLoaded(true);
    }
  }

  // Apply changes to the bus live.
  useEffect(() => {
    if (engine.current?.state === 'live') {
      engine.current.bus('sfx').setConcurrency({ max, steal: strategy });
    }
  }, [max, strategy, engine]);

  // 30 Hz active-voice poll.
  useEffect(() => {
    if (state !== 'live') return;
    const id = setInterval(() => {
      setActive(engine.current?.bus('sfx').voiceCount ?? 0);
    }, 33);
    return () => clearInterval(id);
  }, [state, engine]);

  function fire() {
    if (!engine.current || state !== 'live' || !loaded) return;
    engine.current.sound('loop').play({ loop: true, priority: Math.floor(Math.random() * 10) });
    setSpawnedTotal((s) => s + 1);
  }

  function stopAll() {
    if (!engine.current || state !== 'live') return;
    for (const v of engine.current.bus('sfx').voices()) v.stop();
  }

  return (
    <div className="not-prose rounded-xl border border-border bg-card/40 p-5">
      {error && <div className="mb-3 text-xs text-destructive">{error}</div>}
      {state === 'cold' ? (
        <button type="button" onClick={start} className="w-full rounded-lg bg-gradient-to-br from-primary to-accent px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow shadow-primary/30 transition-all hover:brightness-110">
          Unlock & load
        </button>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2 mb-4">
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">max</span>
              <input
                type="range" min="1" max="12" step="1"
                value={max}
                onChange={(e) => setMax(Number(e.target.value))}
                className="mt-1 w-full accent-primary"
              />
              <span className="font-mono text-[10px] text-muted-foreground">{max}</span>
            </label>
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">steal strategy</span>
              <select
                value={strategy}
                onChange={(e) => setStrategy(e.target.value as Strategy)}
                className="mt-1 w-full rounded-md border border-border/60 bg-background/60 px-2 py-1.5 font-mono text-xs"
              >
                <option value="oldest">oldest</option>
                <option value="lowest-priority">lowest-priority</option>
                <option value="quietest">quietest</option>
                <option value="none">none (reject)</option>
              </select>
            </label>
          </div>

          <div className="mb-3 grid grid-cols-12 gap-1 h-10">
            {Array.from({ length: max }).map((_, i) => (
              <div
                key={i}
                className={
                  'rounded ' +
                  (i < active
                    ? 'bg-gradient-to-br from-primary to-accent animate-pulse-slow'
                    : 'bg-secondary/40 border border-border/60')
                }
              />
            ))}
          </div>
          <div className="mb-4 flex justify-between font-mono text-[10px] text-muted-foreground">
            <span>active: <span className="text-primary">{active}</span> / {max}</span>
            <span>spawned: {spawnedTotal}</span>
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={fire} disabled={state !== 'live' || !loaded} className="flex-1 rounded-lg bg-gradient-to-br from-primary to-accent px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow shadow-primary/30 transition-all hover:brightness-110 active:translate-y-px">
              Fire voice
            </button>
            <button type="button" onClick={stopAll} className="rounded-md border border-destructive/40 bg-destructive/10 px-3 text-xs text-destructive hover:bg-destructive/20">
              stop all
            </button>
          </div>
        </>
      )}
    </div>
  );
}
