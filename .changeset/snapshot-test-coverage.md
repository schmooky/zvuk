---
"@schmooky/zvuk": patch
---

Add unit-test coverage for `Snapshot` — capture / apply / mute restore /
parameter behaviour / missing-bus tolerance / re-capture. No source changes;
pins the existing behaviour of `engine.captureSnapshot()` and
`Snapshot.apply()` so future edits don't silently regress the documented
contract.

Notable behaviours now pinned:

- `apply({ fadeMs: 0 })` snaps and resolves immediately; `apply({ fadeMs: N })`
  takes ≥ N ms.
- Missing buses on the engine are silently skipped (no throw) — preserved
  intentionally so snapshots can be ported across configs.
- Parameter values snap discretely even when `fadeMs > 0` — confirmed as the
  documented behaviour.
- `captureSnapshot()` returns a frozen copy of the state at capture time;
  later mutations to the engine don't affect prior snapshots.
