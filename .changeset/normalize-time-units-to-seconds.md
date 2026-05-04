---
"@schmooky/zvuk": major
---

Normalize all time-valued options to **seconds** to match the Web Audio API. This is a breaking change.

`PlayOptions`, `CompressorConfig`, `MasterLimiterConfig`, and `ReverbConfig` already used seconds. `FadeOptions`, `CrossfadeOptions`, `SnapshotOptions`, `DuckerConfig`, and `SidechainConfig` previously mixed milliseconds in. They now all take seconds, and a few field names changed to remove the `ms` suffix.

### Migration

Old call → new call:

| Before                                              | After                                                     |
| --------------------------------------------------- | --------------------------------------------------------- |
| `voice.fade({ to, ms: 800 })`                       | `voice.fade({ to, duration: 0.8 })`                       |
| `stream.fade({ to, ms: 800 })`                      | `stream.fade({ to, duration: 0.8 })`                      |
| `voice.setPlaybackRate(r, { ms: 800 })`             | `voice.setPlaybackRate(r, { duration: 0.8 })`             |
| `bus.fadeTo(target, 800)`                           | `bus.fadeTo(target, 0.8)`                                 |
| `engine.crossfade(from, to, { ms: 1500 })`          | `engine.crossfade(from, to, { duration: 1.5 })`           |
| `snapshot.apply({ fadeMs: 250 })`                   | `snapshot.apply({ fade: 0.25 })`                          |
| `new Ducker(ctx, src, { attack: 80, release: 400 })`| `new Ducker(ctx, src, { attack: 0.08, release: 0.4 })`    |
| `sidechain: { attack: 80, release: 400 }`           | `sidechain: { attack: 0.08, release: 0.4 }`               |

Mechanical fix in most call sites: divide every existing time value by 1000 and rename `ms` → `duration` (or `fadeMs` → `fade`).

### Why

Web Audio is the underlying runtime, and it speaks seconds everywhere — `AudioContext.currentTime`, every `AudioParam` schedule call, `setValueAtTime`, `linearRampToValueAtTime`, `setValueCurveAtTime`. Mixing milliseconds in user-facing options forced a `* 1000` / `/ 1000` conversion at every boundary and made it easy to pass the wrong unit when copy-pasting across APIs (e.g. `Compressor` vs `Ducker` both have `attack`/`release`, but they were in different units). Aligning on seconds removes that whole class of bug.
