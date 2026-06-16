import { useState } from 'react';
import type { Snapshot } from '@schmooky/zvuk';
import { SAMPLES, useDemoEngine } from './useDemoEngine';
import Waveform from './Waveform';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

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
  const [musicNode, setMusicNode] = useState<AudioNode | null>(null);

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
    setMusicNode(e.bus('music').output);
  }

  async function apply(name: Preset) {
    if (!snaps) return;
    setBusy(true);
    setActive(name);
    await snaps[name].apply({ fade: 0.8 });
    setBusy(false);
  }

  return (
    <Card className="not-prose gap-4 p-5">
      {error && <div className="text-xs text-destructive">{error}</div>}
      {state === 'cold' ? (
        <Button variant="brand" size="lg" className="w-full" onClick={start}>
          Unlock &amp; start
        </Button>
      ) : (
        <>
          <Waveform audioNode={musicNode} variant="bars" label="music bus" />
          <div className="grid gap-2 sm:grid-cols-3">
            {PRESETS.map((p) => (
              <Button
                key={p}
                variant={active === p ? 'default' : 'outline'}
                onClick={() => apply(p)}
                disabled={busy || !snaps}
                className="flex h-auto flex-col gap-0 py-3"
              >
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">snapshot</span>
                <span>{p}</span>
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 font-mono text-[10px] text-muted-foreground">
            <div>music level: <span className="text-primary">{PRESET_STATE[active].music.toFixed(2)}</span></div>
            <div>sfx level: <span className="text-primary">{PRESET_STATE[active].sfx.toFixed(2)}</span></div>
          </div>
        </>
      )}
    </Card>
  );
}
