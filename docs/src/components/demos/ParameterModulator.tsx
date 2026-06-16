import { useEffect, useRef, useState } from 'react';
import type { Parameter } from '@schmooky/zvuk';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { SAMPLES, useDemoEngine } from './useDemoEngine';
import Waveform from './Waveform';

export default function ParameterModulator() {
  const { engine, state, error, unlock } = useDemoEngine({
    buses: { music: { level: 0.6 } },
  });
  const paramRef = useRef<Parameter | null>(null);
  const [intensity, setIntensity] = useState(0.3);
  const [musicLevel, setMusicLevel] = useState(0.6);
  const [pitch, setPitch] = useState(1.0);
  const [busNode, setBusNode] = useState<AudioNode | null>(null);

  async function start() {
    const e = await unlock();
    if (!e) return;
    if (!e.hasSound('loop')) {
      await e.loadSound('loop', [...SAMPLES.music], { bus: 'music' });
      e.sound('loop').play({ loop: true });
    }
    const p = e.parameter('intensity', intensity);
    paramRef.current = p;
    p.bindTo((v) => {
      e.bus('music').level = v;
      setMusicLevel(v);
    }, { from: 0.3, to: 1, curve: 'easeInOut' });
    p.bindTo((v) => setPitch(v), { from: 0.85, to: 1.15, curve: 'easeInOut' });
    setBusNode(e.bus('music').output);
  }

  useEffect(() => {
    paramRef.current?.set(intensity);
  }, [intensity]);

  return (
    <Card className="not-prose gap-4 p-5">
      {error && <div className="text-xs text-destructive">{error}</div>}
      {state === 'cold' ? (
        <Button variant="brand" size="lg" className="w-full" onClick={start}>
          Unlock & start
        </Button>
      ) : (
        <>
          <Waveform audioNode={busNode} variant="bars" label="bus output" className="mb-3" />
          <div className="block">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">parameter("intensity")</span>
              <span className="font-mono text-[10px] text-muted-foreground">{intensity.toFixed(2)}</span>
            </div>
            <Slider
              aria-label="intensity"
              min={0}
              max={1}
              step={0.01}
              value={[intensity]}
              onValueChange={([v]) => setIntensity(v)}
              className="mt-1"
            />
          </div>

          <div className="space-y-2">
            {[
              { label: 'bus("music").level', value: musicLevel, range: '[0.3 → 1.0]', color: 'primary' },
              { label: 'reverb.wet (preview)',     value: pitch,       range: '[0.85 → 1.15]', color: 'warning' },
            ].map(({ label, value, range, color }) => (
              <div key={label} className="rounded-md border border-border/60 bg-background/40 px-3 py-2">
                <div className="flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                  <span className={color === 'primary' ? 'text-primary' : 'text-warning'}>{label}</span>
                  <span>{range}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-secondary/40">
                  <div
                    className={'h-1.5 rounded-full ' + (color === 'primary' ? 'bg-primary' : 'bg-warning')}
                    style={{ width: `${(value - (color === 'primary' ? 0.3 : 0.85)) / (color === 'primary' ? 0.7 : 0.3) * 100}%` }}
                  />
                </div>
                <div className="mt-1 text-right font-mono text-[10px] text-muted-foreground">
                  {value.toFixed(3)}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
