---
'@schmooky/zvuk': minor
---

Apply a short click-free fade-out before `voice.stop()` actually cuts the source node, eliminating the digital click that fires when Web Audio stops a buffer mid-waveform on a non-zero crossing.

`Voice.stop()` previously called `source.stop()` directly, which on the audio thread translates to "discontinue this sample stream right now." If the waveform happened to be at e.g. 0.7 amplitude when the stop landed, the abrupt jump to zero produces a broadband click — most audible on bass-heavy material, looped sustains, and any voice cut by stealing or a region timer.

The new path schedules a tiny linear gain ramp to 0 (default 8 ms) on the voice's gain stage, then schedules `source.stop(stopAt)` so the source actually stops once the ramp lands. The voice's `.ended` promise resolves after the ramp completes; the engine's voice tracking sees the same termination it always did. Re-entrant `stop()` calls during an in-progress fade are no-ops — the first stop wins.

### Configuration

- **Engine default:** `createEngine({ voice: { stopFade: 0.008 } })`. Set to `0` to disable globally and restore the old hard-stop behaviour.
- **Per-call override:** `voice.stop({ fade: 0.05 })` for a longer tail, or `voice.stop({ fade: 0 })` for an immediate hard cut (sample-accurate timing, intentional staccato).

The same fade applies to all stop paths: explicit `stop()`, `AbortSignal` abort, region-timer expiry, and concurrency-driven voice stealing.

`pause()` is intentionally untouched in this release — the maintainer is reworking pause semantics in a follow-up. Pause/resume continues to do a hard-stop on the source node as before.
