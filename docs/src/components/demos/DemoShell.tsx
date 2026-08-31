import type { ReactNode } from 'react';
import type { EngineState } from '@schmooky/zvuk';
import { Button } from '@/components/ui/button';

interface Props {
  state: EngineState;
  /** Runs on the unlock click. Must be a real user gesture handler. */
  onStart: () => void | Promise<void>;
  /** Text on the unlock button. */
  label?: string;
  error?: string | null;
  children: ReactNode;
}

/**
 * The gate in front of an interactive demo.
 *
 * Every demo card used to swap its entire layout on `state === 'cold'`: a
 * single button, then a completely different set of controls once you
 * pressed it. That means you had to commit to starting audio before you
 * could see what the demo even was, and the card jumped by a couple of
 * hundred pixels when it loaded.
 *
 * The controls render immediately instead, dimmed and inert, with the unlock
 * button over them. Nothing shifts when the audio starts; the scrim just
 * lifts.
 */
export default function DemoShell({ state, onStart, label = 'Unlock & start', error, children }: Props) {
  const cold = state === 'cold';
  const recoverable = state === 'suspended' || state === 'interrupted';

  return (
    <div className="relative">
      {error && <div className="mb-2 text-xs text-destructive">{error}</div>}
      <div
        className={`flex flex-col gap-4 ${cold ? 'pointer-events-none select-none opacity-40 blur-[1.5px]' : ''}`}
        aria-hidden={cold || undefined}
        // `inert` keeps the dimmed controls out of the tab order and away
        // from screen readers while the scrim is up.
        inert={cold}
      >
        {children}
      </div>

      {cold && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/45 backdrop-blur-[1px]">
          <Button variant="brand" size="lg" onClick={onStart}>
            {label}
          </Button>
        </div>
      )}

      {recoverable && (
        <div className="absolute inset-x-0 bottom-0 z-10 flex justify-center pb-2">
          <Button variant="secondary" size="sm" onClick={onStart}>
            Audio {state}. Resume
          </Button>
        </div>
      )}
    </div>
  );
}
