---
"@schmooky/zvuk": patch
---

Fix the README sidechain-ducking example. It constructed `new Ducker(engine.context, { source, target, ... })`, but the real signature is `new Ducker(ctx, sourceBus, config)` — the source bus is the second positional argument and `DuckerConfig` has no `source`/`target` keys, so the snippet did not compile or run. It now matches the actual API (and the ducking guide).
