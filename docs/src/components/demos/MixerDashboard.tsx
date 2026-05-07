import { useEffect, useRef, useState } from 'react';
import { type Bus, type Engine, type Voice, createEngine } from '@schmooky/zvuk';
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
  const [state, setState] = useState<'cold' | 'unlocking' | 'live' | 'closed'>('cold');
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

  // Build the engine on first interaction so React's StrictMode double-mount
  // doesn't create two contexts in dev.
  function ensureEngine(): Engine {
    if (engineRef.current) return engineRef.current;
    const engine = createEngine({
      buses: {
        music: { level: 0.8 },
        sfx: { level: 1.0 },
        ui: { level: 0.7 },
      },
      master: { headroom: -3 },
    });
    engine.onStateChange((s) => setState(s));
    engineRef.current = engine;
    return engine;
  }

  useEffect(() => {
    return () => {
      void engineRef.current?.close();
      engineRef.current = null;
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

  async function unlock() {
    try {
      const engine = ensureEngine();
      await engine.unlock();
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
    <div className="rounded-xl border border-border bg-card/40 p-5 not-prose">
      <div className="mb-4 flex items-center justify-between gap-3">
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
          <div className="font-mono text-xs text-muted-foreground">
            {voices} voice{voices === 1 ? '' : 's'}
          </div>
          {!standalone && (
            <button
              type="button"
              onClick={popOut}
              title="Open in a separate window for second-monitor mixing"
              className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M7 17L17 7" />
                <path d="M9 7h8v8" />
              </svg>
              Pop out
            </button>
          )}
        </div>
      </div>

      {state === 'cold' ? (
        <button
          type="button"
          onClick={unlock}
          className="w-full rounded-lg bg-gradient-to-br from-primary to-accent px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:brightness-110"
        >
          Unlock audio & load samples
        </button>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}

      {state !== 'cold' && (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            {BUS_NAMES.map((name) => (
              <div
                key={name}
                className="rounded-lg border border-border/60 bg-background/60 p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-xs uppercase tracking-[0.14em] text-primary">
                    {name}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleMute(name)}
                    className={
                      'rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ' +
                      (muted[name]
                        ? 'border-destructive/60 text-destructive bg-destructive/10'
                        : 'border-border/60 text-muted-foreground hover:text-foreground')
                    }
                  >
                    {muted[name] ? 'muted' : 'mute'}
                  </button>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={levels[name]}
                  onChange={(e) => setLevel(name, Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                  level: {levels[name].toFixed(2)}
                </div>
                <Waveform audioNode={busNodes[name]} variant="bars" height={36} className="mt-2" />
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {SAMPLES.map((s) => {
              const ready = loadedSet.has(s.name);
              return (
                <button
                  key={s.name}
                  type="button"
                  disabled={!ready || state !== 'live'}
                  onClick={() => play(s.name)}
                  className="flex items-center justify-between rounded-md border border-border/60 bg-secondary/40 px-3 py-2 text-left text-sm transition-colors hover:bg-secondary disabled:opacity-40 disabled:hover:bg-secondary/40"
                >
                  <span className="font-mono">{s.name}</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    {s.bus}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            Each sample is shipped as <code className="font-mono text-primary">.webm</code> (Opus) +
            <code className="font-mono text-primary">.m4a</code> (AAC). The engine picks whichever your browser
            supports.
          </p>
        </>
      )}
    </div>
  );
}
