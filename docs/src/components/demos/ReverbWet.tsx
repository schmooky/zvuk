import { useEffect, useRef, useState } from 'react';
import { Reverb, type Engine } from '@schmooky/zvuk';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import CustomSoundField from './CustomSoundField';
import { SAMPLES, decodeFileToSound, useDemoEngine } from './useDemoEngine';
import Waveform from './Waveform';

export default function ReverbWet() {
  const { engine, state, error, setError, unlock } = useDemoEngine({
    buses: { music: { level: 0.7 } },
  });
  const reverbRef = useRef<Reverb | null>(null);
  const [wet, setWet] = useState(0.3);
  const [decay, setDecay] = useState(1.5);
  const [bypass, setBypass] = useState(false);
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
    if (!reverbRef.current) {
      reverbRef.current = new Reverb(e.context, { wet, decay: { seconds: decay } });
      e.bus('music').addFx(reverbRef.current);
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

  useEffect(() => {
    reverbRef.current?.setWet(wet);
  }, [wet]);

  useEffect(() => {
    if (reverbRef.current) reverbRef.current.bypassed = bypass;
  }, [bypass]);

  // Decay length requires a fresh IR — recreate on change.
  useEffect(() => {
    if (state !== 'live' || !engine.current) return;
    if (!reverbRef.current) return;
    const e = engine.current;
    e.bus('music').removeFx(reverbRef.current);
    reverbRef.current.dispose();
    const fresh = new Reverb(e.context, { wet, decay: { seconds: decay } });
    e.bus('music').addFx(fresh);
    reverbRef.current = fresh;
    fresh.bypassed = bypass;
    // intentionally not reading wet/bypass in deps — those have their own effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decay]);

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
          <Waveform audioNode={busNode} variant="bars" label="bus output (post-reverb)" />
          <div className="grid gap-3 md:grid-cols-2">
            <div className="block">
              <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em]">
                <span className="text-primary">wet</span>
                <span className="text-muted-foreground">{wet.toFixed(2)}</span>
              </div>
              <Slider
                className="mt-2"
                min={0}
                max={1}
                step={0.01}
                value={[wet]}
                onValueChange={([v]) => setWet(v)}
                aria-label="reverb wet mix"
              />
            </div>
            <div className="block">
              <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em]">
                <span className="text-primary">decay (s)</span>
                <span className="text-muted-foreground">{decay.toFixed(2)}</span>
              </div>
              <Slider
                className="mt-2"
                min={0.2}
                max={4}
                step={0.1}
                value={[decay]}
                onValueChange={([v]) => setDecay(v)}
                aria-label="reverb decay seconds"
              />
            </div>
          </div>

          <Button
            variant={bypass ? 'outline' : 'secondary'}
            size="sm"
            className={
              bypass
                ? 'w-full font-mono uppercase tracking-[0.14em] border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive'
                : 'w-full font-mono uppercase tracking-[0.14em]'
            }
            onClick={() => setBypass((b) => !b)}
          >
            {bypass ? 'bypassed' : 'engaged'}
          </Button>
        </>
      )}
    </Card>
  );
}
