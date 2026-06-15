---
"@schmooky/zvuk": patch
---

`Voice.cues()` now always yields a terminal `ended` cue. If the iterator was attached after the voice had already finished, it previously returned an empty stream — so a consumer awaiting `ended` from `cues()` never observed completion.
