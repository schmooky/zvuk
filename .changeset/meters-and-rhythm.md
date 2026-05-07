---
"@schmooky/zvuk": minor
---

Live amplitude meters on Voice and Bus, plus a `rhythm-metronome` example.

```ts
// Per-voice readout — lazy AnalyserNode tap on the voice's gain stage.
const v = engine.sound('hit').play();
v.level();   // → { rms: 0.18, peak: 0.42 }   linear, in [0..1]

// Per-bus readout — same shape, on bus output.
engine.bus('music').meter();
```

Both methods return `{ rms, peak }` as linear values in `[0..1]`. The first call on each instance lazily attaches an AnalyserNode as a passive sibling of the existing audio path — no cost until you read, no signal flow change.

Three things ship together because they share the same primitive:

- **`voice.level()`** — drives per-voice clip indicators, custom voice-stealing rules, or "loudest voice in the mix" UI.
- **`bus.meter()`** — drives mixer-dashboard VU meters and automation that reacts to bus level.
- **`'quietest'` voice steal works for real now.** Previously it logged a console warning and silently fell back to `'oldest'` (per the v1.4.0 changelog). With per-voice levels available it now does what the docs said all along: when the bus hits its concurrency limit, the voice with the lowest live RMS is stolen. The fallback warning is gone.

A new vanilla example, `examples/rhythm-metronome/`, ties it together: sample-accurate clicks via `engine.scheduleAt`, a live VU bar driven by `bus.meter()`, and a per-voice peak meter showing `voice.level()` on the most-recently-fired voice. BPM control with drift-free re-anchoring.

Documented on the Voice and Bus concept pages.
