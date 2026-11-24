---
"@schmooky/zvuk": major
---

zvuk 2.0. See MIGRATION.md for the full list; most apps upgrade without changes.

Breaking:

- `resolveAsset` receives the public asset name plus `kind` (`'sound' | 'sprite' | 'variants' | 'music'`) and `part` (variant index or music part) instead of internal keys such as `__sprite:ui`.
- `StreamSound.play()` resolves `true` when playing and `false` when the browser refused, instead of `void`.
- A voice a concurrency limit rejects never starts: it has `rejected === true`, emits only `'ended'`, and makes no sound. v1 played it for the length of the stop fade.
- `'lowest-priority'` stealing rejects a new voice whose priority is lower than every playing voice's.
- `loadSprite` validates regions against the buffer and throws `RangeError` for one that doesn't fit; a missing region throws the new `SpriteRegionNotFoundError`.
- Reloading a stream or music name disposes the stream it replaces or stops the music's live instances.
- `Bus.applyConcurrencyOnSpawn` is removed (it was engine-internal).
- `zvuk gen` emits a `loadBank(engine, PreloadOptions)` that loads through `engine.preload`; `loop` is entry data, not a load option.
- The CLI rejects unknown options and invalid `--formats`, and keeps folder layout under `--out`.
- The tarball no longer ships source maps.

Deprecated: `engine.masterMeter()`, use `engine.master.meter()`.
