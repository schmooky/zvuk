---
"@schmooky/zvuk": patch
---

Minor cleanups: use `Math.SQRT1_2` for the occlusion filter's Butterworth Q (clears the last Biome warning) and fix a stale `Bus.fxInput` doc comment that claimed it equals `input` (it's a distinct node the FX chain splices into).
