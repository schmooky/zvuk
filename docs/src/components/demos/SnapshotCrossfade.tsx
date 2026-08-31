import { useRef, useState } from 'react';
import type { Engine, Snapshot, Voice } from '@schmooky/zvuk';
import DemoShell from './DemoShell';
import { SAMPLES, decodeFileToSound, useDemoEngine } from './useDemoEngine';
import CustomSoundField from './CustomSoundField';
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
  const { engine, state, error, setError, unlock } = useDemoEngine({
    buses: { music: { level: 0.8 }, sfx: { level: 0.3 } },
  });
  const [snaps, setSnaps] = useState<Record<Preset, Snapshot> | null>(null);
  const [active, setActive] = useState<Preset>('menu');
  const [busy, setBusy] = useState(false);
  const [musicNode, setMusicNode] = useState<AudioNode | null>(null);
  const [customFile, setCustomFile] = useState<File | null>(null);
  const voiceRef = useRef<Voice | null>(null);

  async function ensureSound(e: Engine, file: File | null): Promise<void> {
    if (file) await decodeFileToSound(e, 'loop', file, 'music');
    else if (!e.hasSound('loop')) await e.loadSound('loop', [...SAMPLES.music], { bus: 'music' });
  }

  async function start() {
    const e = await unlock();
    if (!e) return;
    await ensureSound(e, customFile);
    if (!voiceRef.current) {
      voiceRef.current = e.sound('loop').play({ loop: true });
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

  async function handlePick(file: File | null) {
    setCustomFile(file);
    const e = engine.current;
    if (!e || e.state !== 'live') return; // cold — start() will use it
    try {
      await ensureSound(e, file);
      // Restart the looping music voice; the snapshots/crossfade logic operate
      // on the bus mix and are unaffected.
      voiceRef.current?.stop();
      voiceRef.current = e.sound('loop').play({ loop: true });
    } catch {
      setError('Could not decode that audio file.');
    }
  }

  return (
    <Card className="not-prose gap-4 p-5">
      {error && <div className="text-xs text-destructive">{error}</div>}
      <CustomSoundField onPick={handlePick} />
      <DemoShell state={state} onStart={start} label="Unlock & start">
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
      </DemoShell>
    </Card>
  );
}
