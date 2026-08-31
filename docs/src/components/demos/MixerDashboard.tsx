import { useEffect, useMemo, useRef, useState } from 'react';
import type { AudioLevel, Bus, Engine, EngineState, Voice } from '@schmooky/zvuk';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  applyBusConfig,
  getDemoEngine,
  getDemoState,
  stopVoicesOn,
  subscribeDemoState,
  unlockDemoEngine,
} from './sharedEngine';
import DemoShell from './DemoShell';
import Meter from './Meter';
import Waveform from './Waveform';

type Sample = { name: string; sources: string[]; bus: 'music' | 'sfx' | 'ui' };

const SAMPLES: Sample[] = [
  { name: 'card-shuffle', sources: ['/audio/card-shuffle.webm', '/audio/card-shuffle.m4a'], bus: 'music' },
  { name: 'chip-lay', sources: ['/audio/chip-lay-1.webm', '/audio/chip-lay-1.m4a'], bus: 'sfx' },
  { name: 'chips-collide', sources: ['/audio/chips-collide-1.webm', '/audio/chips-collide-1.m4a'], bus: 'sfx' },
  { name: 'dice-throw', sources: ['/audio/dice-throw-1.webm', '/audio/dice-throw-1.m4a'], bus: 'sfx' },
  { name: 'card-place', sources: ['/audio/card-place-1.webm', '/audio/card-place-1.m4a'], bus: 'ui' },
  { name: 'card-slide', sources: ['/audio/card-slide-1.webm', '/audio/card-slide-1.m4a'], bus: 'ui' },
];

const BUS_NAMES = ['music', 'sfx', 'ui'] as const;
type BusName = (typeof BUS_NAMES)[number];

interface Props {
  /** When true, hide the "Pop out" button (we're already in the popped-out window). */
  standalone?: boolean;
}

export default function MixerDashboard({ standalone = false }: Props = {}) {
  const engineRef = useRef<Engine | null>(null);
  const [state, setState] = useState<EngineState>('cold');
  const [levels, setLevels] = useState<Record<BusName, number>>({ music: 0.8, sfx: 1, ui: 0.7 });
  const [muted, setMuted] = useState<Record<BusName, boolean>>({ music: false, sfx: false, ui: false });
  const [voices, setVoices] = useState<number>(0);
  const [loadedSet, setLoadedSet] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busNodes, setBusNodes] = useState<Record<BusName, AudioNode | null>>({
    music: null,
    sfx: null,
    ui: null,
  });

  // The engine is shared with every other demo on the page, so this only
  // takes a reference and sets the levels this dashboard wants to show.
  function ensureEngine(): Engine {
    const engine = getDemoEngine();
    engineRef.current = engine;
    return engine;
  }

  useEffect(() => {
    const unsubscribe = subscribeDemoState(setState);
    setState(getDemoState());
    return () => {
      unsubscribe();
      stopVoicesOn(BUS_NAMES);
    };
  }, []);

  // Voice counter polled at 30Hz so we can show live activity without
  // wiring per-voice subscriptions for this demo.
  useEffect(() => {
    if (state !== 'live') return;
    const id = setInterval(() => {
      setVoices(engineRef.current?.activeVoices().length ?? 0);
    }, 33);
    return () => clearInterval(id);
  }, [state]);

  // One reader per bus, stable across renders so the meter's frame loop
  // isn't rebuilt on every state change.
  const readers = useMemo(
    () =>
      Object.fromEntries(
        BUS_NAMES.map((name) => [
          name,
          (): AudioLevel | null => {
            const e = engineRef.current;
            if (!e || e.state !== 'live') return null;
            return e.bus(name).meter();
          },
        ]),
      ) as Record<BusName, () => AudioLevel | null>,
    [],
  );

  async function unlock() {
    try {
      ensureEngine();
      const engine = await unlockDemoEngine();
      engineRef.current = engine;
      applyBusConfig({ music: { level: 0.8 }, sfx: { level: 1 }, ui: { level: 0.7 } });
      setBusNodes({
        music: engine.bus('music').output,
        sfx: engine.bus('sfx').output,
        ui: engine.bus('ui').output,
      });
      // Pre-load samples in parallel.
      await Promise.all(
        SAMPLES.map(async (s) => {
          if (engine.hasSound(s.name)) return;
          await engine.loadSound(s.name, s.sources, { bus: s.bus });
          setLoadedSet((prev) => new Set(prev).add(s.name));
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function play(name: string) {
    if (!engineRef.current || state !== 'live') return;
    if (!engineRef.current.hasSound(name)) return;
    const v: Voice = engineRef.current.sound(name).play({
      volume: { jitter: 0.05 },
      pitch: { jitter: 0.04 },
    });
    void v.ended.then(() => setVoices(engineRef.current?.activeVoices().length ?? 0));
  }

  function setLevel(name: BusName, value: number) {
    setLevels((prev) => ({ ...prev, [name]: value }));
    if (engineRef.current?.state === 'live') {
      const bus: Bus = engineRef.current.bus(name);
      bus.level = value;
    }
  }

  function toggleMute(name: BusName) {
    setMuted((prev) => {
      const next = { ...prev, [name]: !prev[name] };
      if (engineRef.current?.state === 'live') {
        engineRef.current.bus(name).muted = next[name];
      }
      return next;
    });
  }

  function popOut() {
    const features = 'popup,width=520,height=720,menubar=no,toolbar=no,location=no,status=no';
    const w = window.open('/playground/mixer/', 'zvuk-mixer', features);
    if (w) w.focus();
  }

  return (
    <Card className="not-prose gap-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={
              'inline-block h-2 w-2 rounded-full ' +
              (state === 'live' ? 'bg-primary animate-pulse-slow' : 'bg-muted-foreground/50')
            }
          />
          <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
            engine.state = {state}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="font-mono">
            {voices} voice{voices === 1 ? '' : 's'}
          </Badge>
          {!standalone && (
            <Button
              variant="ghost"
              size="sm"
              onClick={popOut}
              title="Open in a separate window for second-monitor mixing"
              className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M7 17L17 7" />
                <path d="M9 7h8v8" />
              </svg>
              Pop out
            </Button>
          )}
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}

      <DemoShell state={state} onStart={unlock} label="Unlock audio & load samples">

        <>
          <div className="grid gap-3 md:grid-cols-3">
            {BUS_NAMES.map((name) => (
              <Card key={name} className="gap-2 border-border/60 bg-background/60 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs uppercase tracking-[0.14em] text-primary">
                    {name}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Label
                      htmlFor={`mute-${name}`}
                      className="font-mono text-[10px] uppercase text-muted-foreground"
                    >
                      {muted[name] ? 'muted' : 'mute'}
                    </Label>
                    <Switch
                      id={`mute-${name}`}
                      checked={muted[name]}
                      onCheckedChange={() => toggleMute(name)}
                      aria-label={`mute ${name} bus`}
                    />
                  </div>
                </div>
                <Slider
                  min={0}
                  max={1}
                  step={0.01}
                  value={[levels[name]]}
                  onValueChange={([v]) => setLevel(name, v)}
                  aria-label={`${name} bus level`}
                />
                <div className="font-mono text-[10px] text-muted-foreground">
                  level: {levels[name].toFixed(2)}
                </div>
                <Meter read={readers[name]} height={38} readout={false} />
              </Card>
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {SAMPLES.map((s) => {
              const ready = loadedSet.has(s.name);
              return (
                <Button
                  key={s.name}
                  variant="secondary"
                  size="sm"
                  disabled={!ready || state !== 'live'}
                  onClick={() => play(s.name)}
                  className="justify-between"
                >
                  <span className="font-mono">{s.name}</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    {s.bus}
                  </span>
                </Button>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground">
            Each sample is shipped as <code className="font-mono text-primary">.webm</code> (Opus) +
            <code className="font-mono text-primary">.m4a</code> (AAC). The engine picks whichever your browser
            supports.
          </p>
        </>
      </DemoShell>
    </Card>
  );
}
