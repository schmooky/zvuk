---
"@schmooky/zvuk": minor
---

DX wins — five small, mutually-independent additions.

```ts
// 1) Variants — bundle N alternates, picker keeps SFX from sounding robotic.
await engine.loadVariants(
  'coin',
  [['/sfx/coin-1.webm', '/sfx/coin-1.m4a'], ['/sfx/coin-2.webm'], ['/sfx/coin-3.webm']],
  { bus: 'sfx', strategy: 'no-repeat' }, // 'random' | 'no-repeat' | 'shuffle-bag'
);
engine.variants('coin').play();

// 2) Fade-in on play — dual of the click-free stop fade.
engine.sound('ambience').play({ loop: true, volume: 0.7, fadeIn: 0.5 });

// 3) Explicit unload — drops the sound AND evicts its buffer from the LRU.
engine.unloadSound('coin');                          // evictBuffer: true (default)
engine.unloadSound('coin', { evictBuffer: false });  // registry only

// 4) Latency hint — maps to AudioContext.latencyHint.
const engine = createEngine({
  buses: { music: {}, sfx: {} },
  latencyHint: 'interactive',                        // | 'playback' | 'balanced' | number
});

// 5) Branded BusName — engine.bus(name) types against your declared buses.
const engine = createEngine({ buses: { music: {}, sfx: {} } });
engine.bus('music');  // ✓
engine.bus('sxf');    // ✗ Type Error: Argument of type '"sxf"' is not assignable
                      //   to parameter of type '"music" | "sfx"'.
```

- **`engine.loadVariants(name, urls, options)` + `Variants`** — picker strategies are `'random'`, `'no-repeat'` (default), `'shuffle-bag'`. The `'no-repeat'` and `'shuffle-bag'` paths handle the spam-feel-robotic problem every casino slot hits without users rolling their own shufflers.
- **`PlayOptions.fadeIn`** — voice ramps from 0 → volume over the configured window. Eliminates the `play({ volume: 0 }) + voice.fade({ to, duration })` two-step that ambient layers needed.
- **`engine.unloadSound(name, { evictBuffer? })`** — explicit eviction sibling to `removeSound`. Active voices keep playing until they end naturally; only future `play()` calls are affected. `evictBuffer` defaults to `true`.
- **`createEngine({ latencyHint })`** — forwards to `AudioContextOptions.latencyHint`. Slot games doing 60 fps reactive audio want `'interactive'`; long music players want `'playback'`. Browsers honour numeric values on a best-effort basis.
- **Branded `BusName` types.** `Engine` and `EngineConfig` are generic in `TBusName`. Pass a literal `buses` map and `engine.bus(name)` type-checks against the keys you declared. Fully backwards-compatible — pass an `EngineConfig` typed as `string` (the default) and `engine.bus()` accepts any string.

Voice and Loading concept pages picked up the new sections.
