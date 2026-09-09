---
'@schmooky/zvuk': patch
---

Run voice and music lifecycle timers on the audio clock instead of the wall
clock.

Third member of the same family as the loop-crossfade stall, from the other
direction: a deadline that belongs to the audio clock, tracked on the wrong
one. The engine suspends its own AudioContext whenever the tab is hidden —
`autoPauseOnHidden` is on by default — which parks the audio clock while
`setTimeout` keeps counting. `waitAudio` exists because of exactly this, and
`voice.fade()` already used it; the timers that end voices did not.

- `voice.stop({ fade })` and `music.stop({ fade })` tore the node graph down
  and resolved `.ended` after `fade` seconds of *wall* time. Hide the tab
  mid-fade and `.ended` resolved over a ramp that had not run and a source
  that had not reached its scheduled stop — against the documented contract
  that it "resolves when the audio actually stops".
- A duration-bounded region (the sprite path, where nothing on the audio
  thread bounds the source) was cut short by however long the tab spent
  hidden, losing the audio it still owed.
- The music part-handover timers reported `currentPart` as `'loop'` or
  `'outro'` before those parts had started.

All four now wait on the audio clock through a new internal `afterAudio`,
which `waitAudio` is also built on. A closed context's clock never advances
again, so a wait on one fires rather than hanging — `.ended` still settles if
the engine closes mid-fade.

The Web Audio test fake used to reset `currentTime` to zero whenever the
context left the running state, which hid all of this. It now holds the clock
across a suspend and resumes from where it left off, as engines do.
