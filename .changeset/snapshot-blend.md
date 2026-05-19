---
"@schmooky/zvuk": minor
---

Snapshot blend — interpolate the live mix between two captured snapshots.

```ts
const calm   = engine.captureSnapshot('calm');
// ...set the mix to its combat shape, then capture again.
const combat = engine.captureSnapshot('combat');

// Snap the live mix to lerp(calm, combat, t).
engine.blendSnapshots(calm, combat, 0.4);

// Drive it from a Parameter — bus levels and parameter values follow per-frame.
const tension = engine.parameter('tension', 0);
tension.subscribe((t) => engine.blendSnapshots(calm, combat, t));
tension.set(0.75);
```

- **`engine.blendSnapshots(a, b, t)`** — snaps every bus level and parameter value to `lerp(a, b, t)`. `t` is clamped to `[0, 1]`. Each call is instant (the 10 ms anti-click ramp on `bus.level` still applies), so calling it on every frame is cheap.
- **`snapshot.blendWith(other, t)`** — same operation as a method on `Snapshot`, mirroring `apply()`.
- Buses or parameters present in only one of the two snapshots are skipped. Mute flips at `t = 0.5` rather than interpolating, since the flag is binary.
- For one-shot crossfades with a fade duration, `snapshot.apply({ fade })` is unchanged — `blendSnapshots` is the continuous-knob sibling.

New `examples/snapshot-blend/` shows the pattern end-to-end: two looping layers, a slider drives a `tension` parameter that interpolates between a `calm` and `combat` snapshot.
