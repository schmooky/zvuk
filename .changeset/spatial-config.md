---
"@schmooky/zvuk": minor
---

Spatializer 3D config exposed, plus a single-knob occlusion parameter.

```ts
// 3D config — previously hard-coded, now configurable per voice.
engine.sound('engine').play({
  spatializer: {
    position: [10, 0, 0],
    refDistance: 5,            // full volume within 5 units
    maxDistance: 250,
    rolloffFactor: 1.5,
    distanceModel: 'inverse',  // 'linear' | 'inverse' | 'exponential'
    occlusion: 0,              // 0..1 — "behind a wall" knob
  },
});

// Live setters for moving sources / dynamic environments.
v.spatializer?.setRefDistance(8);
v.spatializer?.setMaxDistance(500);
v.spatializer?.setRolloffFactor(2);
v.spatializer?.setDistanceModel('linear');
v.spatializer?.setOcclusion(0.7);
```

Two related changes:

- **3D config exposed.** `refDistance`, `maxDistance`, `rolloffFactor`, and `distanceModel` are now `SpatialOptions` fields and have matching live setters on `Spatializer`. Previously these were hard-coded to `(1, 1000, 1, 'inverse')`. Defaults match Web Audio sensible values (`(1, 10000, 1, 'inverse')`); existing code is unaffected unless it relied on the slightly tighter `maxDistance` of 1000.
- **Occlusion knob.** A new `occlusion: 0..1` field on `SpatialOptions`, plus `setOcclusion(amount)` on `Spatializer`. Drives an internal `BiquadFilterNode` lowpass (cutoff sweeps log-style from 22050 Hz to ~500 Hz) plus a gain stage (-6 dB at amount = 1). Independent of distance attenuation; bind a single `Parameter` to both `setOcclusion` and a position update if you want one knob to drive both.

3D Spatializers gain one extra `BiquadFilterNode` + `GainNode` per voice for the always-on (but transparent at occlusion = 0) occlusion chain. 2D StereoPanner spatializers are unchanged.

Documented on the Spatializer concept page.
