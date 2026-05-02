import { useState } from 'react';
import type { Snapshot } from 'zvuk';
import { SAMPLES, useDemoEngine } from './useDemoEngine';

const PRESETS = ['menu', 'gameplay', 'boss'] as const;
type Preset = (typeof PRESETS)[number];

const PRESET_STATE: Record<Preset, { music: number; sfx: number }> = {
  menu:     { music: 0.8, sfx: 0.3 },
  gameplay: { music: 0.4, sfx: 1.0 },
  boss:     { music: 1.0, sfx: 0.8 },
};

export default function SnapshotCrossfade() {
  const { engine, state, error, unlock } = useDemoEngine({
    buses: { music: { level: 0.8 }, sfx: { level: 0.3 } },
  });
  const [snaps, setSnaps] = useState<Record<Preset, Snapshot> | null>(null);
  const [active, setActive] = useState<Preset>('menu');
  const [busy, setBusy] = useState(false);

  async function start() {
    const e = await unlock();
    if (!e) return;
    if (!e.hasSound('loop')) {
      await e.loadSound('loop', [...SAMPLES.music], { bus: 'music' });
      e.sound('loop').play({ loop: true });
    }
    // Build the three snapshots from explicit state — we don't need to
    // mutate the engine to capture them.
    const built = {} as Record<Preset, Snapshot>;
    for (const name of PRESETS) {
      built[name] = e.snapshot(name, {
        buses: {
          music: { level: PRESET_STATE[name].music, muted: false },
          sfx: { level: PRESET_STATE[name].sfx, muted: false },
        },
        parameters: {},
      });
    }
    setSnaps(built);
  }

  async function apply(name: Preset) {
    if (!snaps) return;
    setBusy(true);
    setActive(name);
    await snaps[name].apply({ fadeMs: 800 });
    setBusy(false);
  }

  return (
    <div className="not-prose rounded-xl border border-border bg-card/40 p-5">
      {error && <div className="mb-3 text-xs text-destructive">{error}</div>}
      {state === 'cold' ? (
        <button type="button" onClick={start} className="w-full rounded-lg bg-gradient-to-br from-primary to-accent px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow shadow-primary/30 transition-all hover:brightness-110">
          Unlock & start
        </button>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-3">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => apply(p)}
                disabled={busy || !snaps}
                className={
                  'rounded-lg border px-3 py-3 text-sm font-medium transition-all ' +
                  (active === p
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border/60 bg-secondary/30 text-muted-foreground hover:bg-secondary/50 hover:text-foreground')
                }
              >
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">snapshot</div>
                <div>{p}</div>
              </button>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 font-mono text-[10px] text-muted-foreground">
            <div>music level: <span className="text-primary">{PRESET_STATE[active].music.toFixed(2)}</span></div>
            <div>sfx level: <span className="text-primary">{PRESET_STATE[active].sfx.toFixed(2)}</span></div>
          </div>
        </>
      )}
    </div>
  );
}
