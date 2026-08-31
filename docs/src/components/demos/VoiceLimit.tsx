import { useEffect, useState } from 'react';
import type { ConcurrencyConfig, Engine } from '@schmooky/zvuk';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import DemoShell from './DemoShell';
import CustomSoundField from './CustomSoundField';
import { SAMPLES, decodeFileToSound, useDemoEngine } from './useDemoEngine';
import Waveform from './Waveform';

type Strategy = NonNullable<ConcurrencyConfig['steal']>;

export default function VoiceLimit() {
  const { engine, state, error, setError, unlock } = useDemoEngine({
    buses: { sfx: { concurrency: { max: 4, steal: 'oldest' } } },
  });
  const [loaded, setLoaded] = useState(false);
  const [customFile, setCustomFile] = useState<File | null>(null);
  const [max, setMax] = useState(4);
  const [strategy, setStrategy] = useState<Strategy>('oldest');
  const [active, setActive] = useState(0);
  const [spawnedTotal, setSpawnedTotal] = useState(0);
  const [busNode, setBusNode] = useState<AudioNode | null>(null);

  async function ensureSound(e: Engine, file: File | null) {
    if (file) await decodeFileToSound(e, 'loop', file, 'sfx');
    else if (!e.hasSound('loop')) await e.loadSound('loop', [...SAMPLES.music], { bus: 'sfx' });
  }

  async function start() {
    const e = await unlock();
    if (!e) return;
    await ensureSound(e, customFile);
    setLoaded(true);
    setBusNode(e.bus('sfx').output);
  }

  async function handlePick(file: File | null) {
    setCustomFile(file);
    const e = engine.current;
    if (!e || e.state !== 'live') return; // picked while cold — start() will use it
    try {
      await ensureSound(e, file);
    } catch {
      setError('Could not decode that audio file.');
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
    <Card className="not-prose gap-4 p-5">
      {error && <div className="text-xs text-destructive">{error}</div>}
      <CustomSoundField onPick={handlePick} />
      <DemoShell state={state} onStart={start} label="Unlock & load">
          <Waveform audioNode={busNode} variant="bars" label="sfx bus" />
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">max</span>
              <Slider
                min={1}
                max={12}
                step={1}
                value={[max]}
                onValueChange={([v]) => setMax(Number(v))}
                aria-label="max voices"
                className="mt-2"
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

          <div className="grid grid-cols-12 gap-1 h-10">
            {Array.from({ length: max }).map((_, i) => (
              <div
                key={i}
                className={
                  'rounded ' +
                  (i < active
                    ? 'bg-gradient-to-br from-primary to-brand2 animate-pulse-slow'
                    : 'bg-secondary/40 border border-border/60')
                }
              />
            ))}
          </div>
          <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
            <Badge variant="brand">active: {active} / {max}</Badge>
            <Badge variant="secondary">spawned: {spawnedTotal}</Badge>
          </div>

          <div className="flex gap-2">
            <Button variant="brand" className="flex-1 active:translate-y-px" disabled={state !== 'live' || !loaded} onClick={fire}>
              fire voice
            </Button>
            <Button variant="outline" size="sm" className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={stopAll}>
              stop all
            </Button>
          </div>
      </DemoShell>
    </Card>
  );
}
