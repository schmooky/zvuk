---
"@schmooky/zvuk": patch
---

`Ducker`'s envelope follower now measures the real frame delta (from the rAF timestamp, clamped to 1–100 ms) instead of assuming a fixed `1/60 s`. The attack/release time constants were previously ~2× too fast on 120 Hz displays and far too slow in throttled/background tabs.
