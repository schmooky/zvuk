---
'@schmooky/zvuk': patch
---

Fix `music.skipToOutro({ at: 'loop-end' })` cutting the music instantly instead
of ending it on the bar.

Same family as the loop-crossfade stall: an absolute audio time that had gone
stale, then used as though it were still ahead of the clock. Engines clamp a
past-dated `start()`/`stop()` up to the current time, so the loop was cut
wherever it happened to be and the outro fired immediately.

- On the native-loop path — the default, since `loopCrossfade` is off unless
  you ask for it — the next-boundary marker was written once when the loop
  started and never again, because that path has no segment chain to re-anchor
  it. Every iteration after the first read a boundary that was already behind
  the clock. Boundaries are now computed against the clock from the loop's
  anchor, so the outro lands on the next real one.
- Called during the intro, the outro was scheduled an intro duration from *now*
  rather than at the intro's own end, leaving a hole as wide as the part of the
  intro that had already played. The intro's scheduled end is now tracked and
  used.
- A boundary can still be behind us if the main thread stalled through it. That
  case now asks for "now" plainly instead of a time it knows has gone.

`engine.scheduleAt` and the internal `Scheduler` also picked up documentation on
clamping a stamped `audioTime` to the clock — dispatch is a JS callback and can
run after its own deadline, which is the same footgun this release fixes
internally.
