---
"@schmooky/zvuk": patch
---

`VoiceJitter` now accepts a `base` so `volume`/`pitch` jitter can be combined with a chosen center value, e.g. `play({ pitch: { base: 1.5, jitter: 0.1 } })`. Previously jitter always centered on `1.0`, so a base playback rate or volume could not be combined with jitter. Plain numbers and `{ jitter }`-only forms are unchanged.
