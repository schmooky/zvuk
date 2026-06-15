---
"@schmooky/zvuk": patch
---

`preload` abort hardening: `combineSignals` now removes both abort listeners as soon as either fires, so a batch-wide signal reused across every item no longer accumulates a stale listener per item. (In-flight fetches were already cancelled on abort via signal propagation; this also adds explicit mid-batch abort test coverage.)
