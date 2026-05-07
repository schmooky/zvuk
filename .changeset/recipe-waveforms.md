---
"@schmooky/zvuk": patch
---

Live waveform overlays on every interactive docs demo.

Each playable component on the docs site now renders a real-time oscilloscope (or, for the FilterSweep demo, a frequency-domain spectrum) on the bus the demo routes audio through. As you drag a slider, toggle bypass, fire a voice, or pan a sound, you see the signal change immediately — not just hear it.

Wired into all 14 docs demos: `BusFader`, `CompressorPlayground`, `CrossfadeDemo`, `FilterSweep`, `MixerDashboard` (per-bus mini-meters), `ParameterModulator`, `PitchStretch`, `ReverbWet`, `SlotReel`, `SnapshotCrossfade`, `SoundCard`, `SpatialPanner`, `VoiceJitter`, `VoiceLimit`.

Implementation is a small `<Waveform audioNode={busNode} />` React component that lazily attaches its own AnalyserNode as a passive sibling of the source node — no engine change, no audio-path change. Cleans up on unmount or when the source changes.

No public API change; docs-site polish only.
