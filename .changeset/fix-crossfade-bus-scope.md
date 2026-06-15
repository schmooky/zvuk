---
"@schmooky/zvuk": patch
---

`engine.crossfade` now only fades out instances of `from` on the **same bus** the incoming voice plays on — previously it faded out every voice of `from` across all buses, so crossfading on the music bus could stop the same sound playing on an ambience bus. Also corrected the docs: a fresh voice for `to` is always started (it never reuses an already-playing `to`, despite the previous wording).
