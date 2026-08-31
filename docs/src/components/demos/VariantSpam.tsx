import { useRef, useState } from 'react';
import type { VariantStrategy } from '@schmooky/zvuk';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import DemoShell from './DemoShell';
import { useDemoEngine, VARIANTS } from './useDemoEngine';
import Waveform from './Waveform';

const STRATEGIES: { id: VariantStrategy; label: string; blurb: string }[] = [
  { id: 'random', label: 'random', blurb: 'Uniform pick. Repeats happen, and they sound like a bug.' },
  { id: 'no-repeat', label: 'no-repeat', blurb: 'Uniform, but never the take you just heard.' },
  { id: 'shuffle-bag', label: 'shuffle-bag', blurb: 'Every take once, then reshuffle. Tetris deals pieces this way.' },
];

/** How many past picks to show. Enough that a repeat run is visible. */
const HISTORY = 14;

/**
 * Four takes of the same dice roll, one strategy switch, and a visible
 * history.
 *
 * `loadVariants` is documented in the loading guide and had no live demo,
 * which made the argument for it purely verbal. The point is hard to hear in
 * the abstract and obvious the moment you can see the picks: set `random`,
 * mash the button, and watch the same take come up twice in a row often
 * enough to sound broken.
 */
export default function VariantSpam() {
  const { engine, state, error, unlock } = useDemoEngine({ buses: { sfx: {} } });
  const [strategy, setStrategy] = useState<VariantStrategy>('random');
  const [history, setHistory] = useState<number[]>([]);
  const [busNode, setBusNode] = useState<AudioNode | null>(null);
  const loadedFor = useRef<VariantStrategy | null>(null);

  /** (Re)register the bundle whenever the strategy changes. */
  async function ensureVariants(next: VariantStrategy) {
    const e = engine.current;
    if (!e || loadedFor.current === next) return;
    await e.loadVariants('dice', VARIANTS.diceRoll as unknown as string[][], {
      bus: 'sfx',
      strategy: next,
    });
    loadedFor.current = next;
  }

  async function start() {
    const e = await unlock();
    if (!e) return;
    await ensureVariants(strategy);
    setBusNode(e.bus('sfx').output);
  }

  async function pick(next: VariantStrategy) {
    setStrategy(next);
    setHistory([]);
    await ensureVariants(next);
  }

  function roll() {
    const e = engine.current;
    if (!e || e.state !== 'live' || !e.hasVariants('dice')) return;
    const bundle = e.variants('dice');
    bundle.play({ volume: 0.9 });
    setHistory((prev) => [...prev, bundle.lastPick].slice(-HISTORY));
  }

  return (
    <Card className="not-prose gap-4 p-5">
      {error && <div className="text-xs text-destructive">{error}</div>}
      <DemoShell state={state} onStart={start} label="Unlock & load takes">
        <Waveform audioNode={busNode} variant="bars" label="sfx bus" />

        <div className="flex flex-wrap gap-1.5">
          {STRATEGIES.map((s) => (
            <Button
              key={s.id}
              variant={strategy === s.id ? 'brand' : 'secondary'}
              size="sm"
              className="font-mono text-[11px]"
              onClick={() => void pick(s.id)}
            >
              {s.label}
            </Button>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground">
          {STRATEGIES.find((s) => s.id === strategy)?.blurb}
        </p>

        <Button variant="brand" onClick={roll} disabled={state !== 'live'}>
          Roll the dice
        </Button>

        <div>
          <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            last {HISTORY} picks
          </div>
          <div className="flex flex-wrap gap-1">
            {history.length === 0 && (
              <span className="font-mono text-[10px] text-muted-foreground">nothing yet</span>
            )}
            {history.map((take, i) => {
              const repeat = i > 0 && history[i - 1] === take;
              return (
                <Badge
                  // Position is the identity here: the same take recurs by design.
                  key={`${i}-${take}`}
                  variant="outline"
                  className={`rounded-full font-mono text-[10px] ${
                    repeat
                      ? 'border-destructive/50 bg-destructive/10 text-destructive'
                      : 'border-border bg-secondary/40 text-muted-foreground'
                  }`}
                  title={repeat ? 'same take twice in a row' : undefined}
                >
                  {take + 1}
                </Badge>
              );
            })}
          </div>
        </div>
      </DemoShell>
    </Card>
  );
}
