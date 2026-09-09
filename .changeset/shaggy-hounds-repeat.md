---
'@schmooky/zvuk': patch
---

Fix looped sounds going permanently silent after a main-thread stall.

A loop-crossfade chain (`play({ loop: true, loopCrossfade })` and the music
loop) stamps each segment's gain envelope at an absolute audio time computed
one segment earlier, and wakes a timer shortly before it. When the main thread
stalls past that deadline — a lazily loaded bundle, a batch of texture uploads,
or a backgrounded tab's throttled timers — the segment was still stamped at the
time that had already passed. Chromium and WebKit clamp past-dated automation
up to the current time, so the segment's fade-in and fade-out legs landed on
the same instant and the second one was refused with `NotSupportedError`. The
exception escaped the timer callback before it could re-arm, so the loop fell
silent and stayed silent for the rest of that voice's life while one-shot
sounds around it kept playing.

A segment that misses its deadline is now rebased onto the audio clock, comes
in at full level when the whole crossfade window has already passed, and chains
the next wake-up off where it actually landed rather than off the deadline it
missed — so one late segment no longer makes every later one late too. The
envelope calls are guarded and the chain re-arms itself regardless, so a
refusal from any engine can no longer end the loop.

Covered by a rendered-audio conformance spec on Chromium and WebKit, and by
stall regression specs for both the voice and music chains. The Web Audio test
fake now models the past-dated clamp that made the failure possible.
