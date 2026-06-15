---
"@schmooky/zvuk": patch
---

Stop calling the master limiter a "brick-wall" limiter. It's a fast-attack `DynamicsCompressorNode` (ratio ~20) — limiter-like but, with a finite attack and no lookahead, it does not guarantee a hard 0 dBFS ceiling. Reworded the README, `Master` docs, and `MasterLimiterConfig`/`MasterConfig` to "soft limiter / best-effort peak control", and fixed the concepts/mixer snippet that used a non-existent `engine.bus('master')` / `master.setLimiter` runtime API (the limiter is configured at construction).
