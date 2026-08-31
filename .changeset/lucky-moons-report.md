---
'@schmooky/zvuk': minor
---

Loading and cache improvements.

- Concurrent loads of the same URL now share one fetch and one decode.
  The shared request is only aborted once every caller has aborted, so
  one caller pulling out doesn't cancel the others.
- The decoded-buffer cache is budgeted in bytes, not entries. Configure
  it with `createEngine({ cache: { maxBytes, maxEntries } })`; defaults
  are 64 MiB and 128 entries.
- `DecodeOptions.onProgress` is implemented — byte-level download
  progress, read off `response.body`.
- `loadMusic` fetches intro, loop and outro in parallel; `loadVariants`
  runs through a worker pool at the same concurrency cap as `preload`,
  instead of awaiting each in a loop.
- `Music` tracks the voices it spawns: `music.voices()` and
  `music.stopAll()`.
- `EngineState` gains `'suspended'`. Code that switches exhaustively over
  it needs a new branch.
- `variants.lastPick` reports which take the most recent `play()` chose, or
  `-1` before the first. The bundle already tracked it internally; it is
  read-only now so a subtitle, a telemetry event or an animation can follow
  whichever alternate actually fired.
