---
'@schmooky/zvuk': patch
---

Fix a set of audio-scheduling and lifecycle bugs.

- `applyRamp` now interrupts a running `setValueCurveAtTime` with
  `cancelAndHoldAtTime` where the engine has it, and no longer lets a
  refused scheduling call escape to the caller — `voice.fade()` and
  `bus.fadeTo()` had no handler of their own.
- A looping sprite region stopped after one pass, which made
  `SpriteRegion.loop` documented but non-functional.
- `voice.setPlaybackRate` never re-armed the region stop-timer, so a
  `duration`-bounded voice at half speed still ended at the original wall
  time.
- `resolveAsset` returning an `ArrayBuffer` had it detached by
  `decodeAudioData`, so a resolver backed by a byte cache broke on its
  second hit.
- `Ducker` started its envelope at 0 (dropping the target bus to silence
  on insertion), wrote `gain.value = 1` on bypass (a click), left stale
  envelope state that could disable ducking after un-bypass, ran its rAF
  loop while bypassed, froze mid-duck in a hidden tab, and threw under
  SSR.
- `Master.rewire()` dropped the meter analyser, so `masterMeter()` read
  zero forever after any `setLimiter()` call. `setHeadroom` now ramps
  instead of writing `gain.value`.
- `Bus.muted` had no equality guard, so `Snapshot.blendWith` fired a
  redundant ramp on every bus on every frame.
- The engine reported `'live'` over a suspended context, so `unlock()`
  early-returned and manual recovery was impossible. `EngineState` gains
  `'suspended'`.
- `new AudioContext()` had no `webkitAudioContext` fallback.
- `close()` left bus groups and the solo set populated and never stopped
  live `MusicVoice` instances.
- Detached fades in `crossfade()` had no `.catch`, and `preload` used
  `Promise.all`, so an abort rejected the batch while siblings rejected
  into the void.
- Errors stringified their cause into the message and discarded it;
  they now pass it through as `cause`.
- Fade promises resolved on `setTimeout` rather than the audio clock, so
  a voice stopped mid-fade still reported at the full duration and a
  frozen ramp resolved anyway.
- `steal: 'quietest'` allocated a permanent `AnalyserNode` per candidate
  voice.
- Sprite and variant parts leaked their internal registry names into
  `hasSound`, into did-you-mean suggestions, and onto `voice.sourceName`,
  which broke `engine.crossfade` for variants.
- `Scheduler.scheduleAt` full-sorted on every insert and never evicted
  cancelled tasks.
- Errors built their did-you-mean text by splicing quote characters into
  the caller's own template, producing `Bus "sxf"; did you mean "sfx" is
  not configured.` The suggestion is now a separate sentence.
- `tsup` ships a minified bundle. The tarball was published unminified at
  25 kB gzipped while the README advertised a min+gzip figure, so the
  number on the page described a build nobody was installing. It is
  16.9 kB now, gated in CI at 18 kB.
