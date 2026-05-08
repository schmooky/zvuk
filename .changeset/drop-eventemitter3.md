---
"@schmooky/zvuk": patch
---

Drop `eventemitter3` runtime dependency.

It was declared in `dependencies` but never imported anywhere in the package — a leftover that slipped in by mistake. `Voice` cue listeners use a plain `Set<fn>` walker, not an `EventEmitter`. zvuk now has zero runtime dependencies, matching the pitch in the README.
