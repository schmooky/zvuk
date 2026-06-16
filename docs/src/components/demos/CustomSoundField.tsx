import { RotateCcwIcon, UploadIcon } from 'lucide-react';
import { useId, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  /**
   * Fires with the chosen File, or `null` when the user resets to the demo's
   * default sample. The demo decodes the File (engine.context.decodeAudioData)
   * and swaps it in via createSound — see `decodeFileToSound`.
   */
  onPick: (file: File | null) => void;
  /** Optional override for the default-state label. */
  label?: string;
  className?: string;
}

/**
 * "Use your own sound" — a tiny file picker for single-sound demos. Lets you
 * drop in any browser-decodable audio file (wav / mp3 / ogg / webm / m4a …)
 * and hear it run through the exact same engine path as the bundled sample.
 */
export default function CustomSoundField({ onPick, label = 'Use your own sound', className }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState<string | null>(null);
  const id = useId();

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setName(file?.name ?? null);
    onPick(file);
  }

  function reset() {
    if (inputRef.current) inputRef.current.value = '';
    setName(null);
    onPick(null);
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="audio/*"
        className="sr-only"
        onChange={handleChange}
      />
      <Button asChild variant="outline" size="sm" className="cursor-pointer">
        <label htmlFor={id}>
          <UploadIcon />
          {name ? 'Replace sound' : label}
        </label>
      </Button>
      {name && (
        <>
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground" title={name}>
            {name}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 text-muted-foreground"
            onClick={reset}
            aria-label="Reset to default sound"
            title="Reset to the bundled sample"
          >
            <RotateCcwIcon className="size-3.5" />
          </Button>
        </>
      )}
    </div>
  );
}
