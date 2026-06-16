import { useEffect, useRef, useState } from 'react';
import { Filter, type FilterKind, type Engine } from '@schmooky/zvuk';
import CustomSoundField from './CustomSoundField';
import { SAMPLES, decodeFileToSound, useDemoEngine } from './useDemoEngine';
import Waveform from './Waveform';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function FilterSweep() {
  const { engine, state, error, setError, unlock } = useDemoEngine({
    buses: { music: { level: 0.7 } },
  });
  const filterRef = useRef<Filter | null>(null);
  const [type, setType] = useState<FilterKind>('lowpass');
  const [freq, setFreq] = useState(1200);
  const [q, setQ] = useState(1);
  const [busNode, setBusNode] = useState<AudioNode | null>(null);
  const [voice, setVoice] = useState<{ stop: () => void } | null>(null);
  const [customFile, setCustomFile] = useState<File | null>(null);

  async function ensureSound(e: Engine, file: File | null) {
    if (file) await decodeFileToSound(e, 'loop', file, 'music');
    else if (!e.hasSound('loop')) await e.loadSound('loop', [...SAMPLES.music], { bus: 'music' });
  }

  async function start() {
    const e = await unlock();
    if (!e) return;
    await ensureSound(e, customFile);
    if (!filterRef.current) {
      filterRef.current = new Filter(e.context, { type, frequency: freq, q });
      e.bus('music').addFx(filterRef.current);
    }
    if (!voice) setVoice(e.sound('loop').play({ loop: true }));
    setBusNode(e.bus('music').output);
  }

  async function handlePick(file: File | null) {
    setCustomFile(file);
    const e = engine.current;
    if (!e || e.state !== 'live') return; // picked while cold — start() will use it
    try {
      await ensureSound(e, file);
      voice?.stop();
      setVoice(e.sound('loop').play({ loop: true }));
    } catch {
      setError('Could not decode that audio file.');
    }
  }

  useEffect(() => { filterRef.current?.setType(type); }, [type]);
  useEffect(() => { filterRef.current?.setFrequency(freq); }, [freq]);
  useEffect(() => { filterRef.current?.setQ(q); }, [q]);

  return (
    <Card className="not-prose gap-4 p-5">
      {error && <div className="text-xs text-destructive">{error}</div>}
      <CustomSoundField onPick={handlePick} />
      {state === 'cold' ? (
        <Button variant="brand" size="lg" className="w-full" onClick={start}>
          Unlock &amp; start music
        </Button>
      ) : (
        <>
          <Waveform audioNode={busNode} variant="bars" label="bus output" />
          <div className="space-y-1.5">
            <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">type</Label>
            <Select value={type} onValueChange={(v) => setType(v as FilterKind)}>
              <SelectTrigger className="w-full font-mono text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lowpass">lowpass</SelectItem>
                <SelectItem value="highpass">highpass</SelectItem>
                <SelectItem value="bandpass">bandpass</SelectItem>
                <SelectItem value="notch">notch</SelectItem>
                <SelectItem value="peaking">peaking</SelectItem>
                <SelectItem value="allpass">allpass</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em]">
              <span className="text-primary">frequency (Hz)</span>
              <span className="text-muted-foreground">{Math.round(freq)}</span>
            </div>
            <Slider
              min={40}
              max={20000}
              step={10}
              value={[freq]}
              onValueChange={([v]) => setFreq(v)}
              aria-label="frequency"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em]">
              <span className="text-primary">Q</span>
              <span className="text-muted-foreground">{q.toFixed(2)}</span>
            </div>
            <Slider
              min={0.1}
              max={20}
              step={0.1}
              value={[q]}
              onValueChange={([v]) => setQ(v)}
              aria-label="Q"
            />
          </div>
        </>
      )}
    </Card>
  );
}
