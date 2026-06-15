---
"@schmooky/zvuk": patch
---

Loop crossfades now use equal-power (sin/cos) ramps instead of linear ones, for both `PlayOptions.loopCrossfade` (Voice) and `MusicLoadOptions.loopCrossfade` (Music). Two overlapping linear ramps summed to a ~3 dB power dip at every loop boundary — the exact seam the feature is meant to hide, and contrary to the "equal-power" the docs already claimed.
