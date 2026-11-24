---
"@schmooky/zvuk": minor
---

New in 2.0:

- `engine.master`: `volume`, `muted`, `fadeTo()`, `headroom`, `setLimiter()`, `reduction`, `meter()`. `MasterConfig` takes `volume` and `mute`.
- `engine.listener` for the 3D scene, `panningModel` and `glide` spatializer options.
- `engine.suspend()` / `engine.resume()`: an app-initiated suspend that a tab switch does not undo.
- `engine.unload(name)` removes any kind of asset and evicts its buffers.
- `play({ at })` schedules a start on the audio clock, on sounds, sprites, variants and music.
- `play({ duck })` ducks a bus for exactly the life of a voice; `bus.duck()` underneath it.
- Per-sound limits: `limit: { max, steal, cooldown }` on load options and `setLimit()` on sounds, sprites and variants. A variants bundle shares one limit.
- Weighted variants: `weights` option and `setWeights()`.
- Music: `pause()` / `resume()` on `MusicVoice`, and a tempo grid with `bpm`, `nextBeat()`, `nextBar()`, `beatAt()`, `onBeat()` and `skipToOutro({ at: 'bar' | 'beat' })`.
- `Parameter.rampTo()` glides; `snapshot.apply({ fade })` glides parameters too.
- Snapshots capture and restore sends, FX bypass and solo.
- `LoadSoundOptions.onProgress` and `PreloadOptions.onBytes` for byte-level progress; preload items take `kind: 'sprite' | 'variants' | 'music'`.
- Streams take a URL ladder, fall back on media errors and expose `ended`.
- `zvuk --version`.
- Newly exported types: `CacheConfig`, `VoiceCue`, `SoundLimit`, `StealStrategy`, `DuckOptions`, `AssetKind`, `BeatEvent`, `MusicGrid`, `PreloadBytesEvent`, the `Preload*Item` types, and the `Listener` class.
