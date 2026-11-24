import { useEffect, useRef, useState } from 'react';
import type { Engine, MusicVoice } from '@schmooky/zvuk';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import DemoShell from './DemoShell';
import { BED_LOOP_CROSSFADE, SAMPLES, useDemoEngine } from './useDemoEngine';

const BPM = 96;
const BEATS_PER_BAR = 4;

/**
 * The v2 music grid. The bed has no tempo of its own, so a tick plays on
 * every `onBeat` at the beat's exact audio time, which makes the grid
 * audible. The stinger is scheduled with `play({ at: voice.nextBar() })`
 * and ducks the music for as long as it rings.
 */
export default function MusicGridDemo() {
  const { engine, state, error, unlock } = useDemoEngine({
    buses: { music: { level: 0.7 }, sfx: { level: 1 } },
  });
  const voiceRef = useRef<MusicVoice | null>(null);
  const offBeatRef = useRef<(() => void) | null>(null);
  const [pos, setPos] = useState<{ bar: number; beatInBar: number } | null>(null);
  const [paused, setPaused] = useState(false);
  const [queued, setQueued] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    return () => {
      offBeatRef.current?.();
      voiceRef.current?.stop({ fade: 0.1 });
    };
  }, []);

  async function load(e: Engine) {
    const jobs: Promise<unknown>[] = [];
    if (!e.hasMusic('grid-bed')) {
      jobs.push(
        e.loadMusic('grid-bed', { loop: [...SAMPLES.stream] }, {
          bus: 'music',
          bpm: BPM,
          beatsPerBar: BEATS_PER_BAR,
          loopCrossfade: BED_LOOP_CROSSFADE,
        }),
      );
    }
    if (!e.hasSound('grid-tick')) jobs.push(e.loadSound('grid-tick', [...SAMPLES.chips2], { bus: 'sfx' }));
    if (!e.hasSound('grid-sting')) jobs.push(e.loadSound('grid-sting', [...SAMPLES.bells1], { bus: 'sfx' }));
    await Promise.all(jobs);
  }

  function startMusic(e: Engine) {
    offBeatRef.current?.();
    const v = e.music('grid-bed').play({ fadeIn: 0.2 });
    voiceRef.current = v;
    setPaused(false);
    setPlaying(true);
    offBeatRef.current = v.onBeat((b) => {
      // Downbeats a little louder, so the bar is audible.
      e.sound('grid-tick').play({ at: b.time, volume: b.beatInBar === 0 ? 0.55 : 0.25 });
      const delay = Math.max(0, (b.time - e.now) * 1000);
      setTimeout(() => setPos({ bar: b.bar, beatInBar: b.beatInBar }), delay);
    });
    void v.ended.then(() => {
      if (voiceRef.current === v) {
        voiceRef.current = null;
        offBeatRef.current?.();
        setPos(null);
        setPlaying(false);
      }
    });
  }

  async function start() {
    const e = await unlock();
    if (!e) return;
    await load(e);
    if (!voiceRef.current) startMusic(e);
  }

  function stinger() {
    const e = engine.current;
    const v = voiceRef.current;
    if (!e || !v || state !== 'live') return;
    const at = v.nextBar();
    if (at == null) return;
    e.sound('grid-sting').play({ at, duck: { bus: 'music', amount: 0.6, attack: 0.02, release: 0.6 } });
    setQueued(at);
    setTimeout(() => setQueued(null), Math.max(0, (at - e.now) * 1000));
  }

  function togglePause() {
    const v = voiceRef.current;
    if (!v) return;
    if (v.isPaused) v.resume();
    else v.pause();
    setPaused(v.isPaused);
  }

  function endOnBar() {
    voiceRef.current?.skipToOutro({ at: 'bar' });
  }

  function restart() {
    const e = engine.current;
    if (e && state === 'live' && !voiceRef.current) startMusic(e);
  }

  return (
    <Card className="not-prose gap-4 p-5">
      <DemoShell state={state} onStart={start} error={error} label="Unlock & start the music">
        <div className="flex items-center justify-between gap-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {BPM} bpm · {BEATS_PER_BAR}/4 {queued != null && <span className="ml-2 text-brand-text">stinger queued</span>}
          </div>
          <div className="font-mono text-xs text-muted-foreground">
            {pos ? `bar ${pos.bar + 1} · beat ${pos.beatInBar + 1}` : '—'}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2" aria-hidden="true">
          {Array.from({ length: BEATS_PER_BAR }, (_, i) => (
            <div
              key={i}
              className={`h-8 rounded-md border transition-colors duration-75 ${
                pos?.beatInBar === i
                  ? i === 0
                    ? 'border-primary bg-primary'
                    : 'border-primary/60 bg-primary/40'
                  : 'border-border bg-secondary/40'
              }`}
            />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Button variant="brand" size="sm" onClick={stinger} disabled={!playing || paused}>
            Stinger on next bar
          </Button>
          <Button variant="outline" size="sm" onClick={togglePause} disabled={!playing}>
            {paused ? 'Resume' : 'Pause'}
          </Button>
          <Button variant="outline" size="sm" onClick={endOnBar} disabled={!playing || paused}>
            End on the bar
          </Button>
          <Button variant="outline" size="sm" onClick={restart} disabled={playing}>
            Play again
          </Button>
        </div>
      </DemoShell>
    </Card>
  );
}
