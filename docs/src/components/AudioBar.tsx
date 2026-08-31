import { useCallback, useEffect, useState } from 'react';
import type { AudioLevel, EngineState } from '@schmooky/zvuk';
import Meter from './demos/Meter';
import {
  getDemoState,
  peekDemoEngine,
  subscribeDemoState,
  unlockDemoEngine,
} from './demos/sharedEngine';

const STATE_COPY: Record<EngineState, string> = {
  cold: 'no context yet',
  unlocking: 'unlocking',
  live: 'live',
  suspended: 'suspended',
  interrupted: 'interrupted by the OS',
  closed: 'closed',
};

/**
 * Global transport for the docs site.
 *
 * The demos loop audio at you, and until now the only way to stop it was to
 * find whichever card started it, or leave the page. This sits in the nav: it
 * reports the shared engine's state, meters the master output, and mutes
 * everything. It stays out of the way until the engine exists, so it never
 * constructs an AudioContext on its own.
 */
export default function AudioBar() {
  const [state, setState] = useState<EngineState>('cold');
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    setState(getDemoState());
    return subscribeDemoState(setState);
  }, []);

  const read = useCallback((): AudioLevel | null => {
    const engine = peekDemoEngine();
    if (!engine || engine.state !== 'live') return null;
    return engine.masterMeter();
  }, []);

  function toggleMute() {
    const engine = peekDemoEngine();
    if (!engine) return;
    const next = !muted;
    setMuted(next);
    for (const name of ['music', 'drums', 'sfx', 'voice', 'ambience', 'ui']) {
      engine.bus(name).muted = next;
    }
  }

  async function resume() {
    await unlockDemoEngine().catch(() => undefined);
  }

  if (state === 'cold' || state === 'closed') return null;

  const recoverable = state === 'suspended' || state === 'interrupted';

  return (
    <div className="flex items-center gap-3" role="group" aria-label="Site audio">
      <span
        className="hidden font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground sm:inline"
        title={`Engine state: ${state}`}
      >
        {STATE_COPY[state]}
      </span>
      <Meter read={read} height={18} readout={false} className="hidden w-32 md:block" />
      {recoverable ? (
        <button
          type="button"
          onClick={resume}
          className="rounded-md border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-primary hover:bg-primary/10"
        >
          resume
        </button>
      ) : (
        <button
          type="button"
          onClick={toggleMute}
          aria-pressed={muted}
          className="rounded-md border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] hover:bg-secondary"
        >
          {muted ? 'unmute' : 'mute'}
        </button>
      )}
    </div>
  );
}
