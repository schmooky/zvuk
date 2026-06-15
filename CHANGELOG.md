# @schmooky/zvuk

## 1.12.1

### Patch Changes

- [#69](https://github.com/schmooky/zvuk/pull/69) [`9a95045`](https://github.com/schmooky/zvuk/commit/9a95045de2c7b85df4fd7ae40c8794026d1d63a2) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix `Bus.fadeTo` so it no longer overrides mute or solo. It previously wrote the output gain unconditionally, so fading a muted (or solo-veiled) bus audibly un-muted it. As a consequence, `Snapshot.apply` could not keep a bus captured as muted silent — the level fade un-muted it right after the mute was applied. `fadeTo` now stores the target level while silenced and applies it when the bus is unmuted/unveiled.

- [#68](https://github.com/schmooky/zvuk/pull/68) [`13a3a94`](https://github.com/schmooky/zvuk/commit/13a3a941c897b09c06c125bdb2c3d6dbb82d004c) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix the `equal-power` fade curve so crossfades stay at constant power. It previously applied a `sin²` gain symmetrically, dipping ~3 dB at the crossfade midpoint — the exact loudness dip equal-power is meant to remove. The curve is now direction-aware (rising legs follow `sin(t·π/2)`, falling legs `cos(t·π/2)`), so two opposing legs sum to unity power. Affects `engine.crossfade`, `Bus`/`Send` fades, `Snapshot.apply`, and `Parameter` bindings using `curve: 'equal-power'`.

- [#71](https://github.com/schmooky/zvuk/pull/71) [`f4580f1`](https://github.com/schmooky/zvuk/commit/f4580f1757e5addbe130294175e7cd74c284290a) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix the README sidechain-ducking example. It constructed `new Ducker(engine.context, { source, target, ... })`, but the real signature is `new Ducker(ctx, sourceBus, config)` — the source bus is the second positional argument and `DuckerConfig` has no `source`/`target` keys, so the snippet did not compile or run. It now matches the actual API (and the ducking guide).

- [#70](https://github.com/schmooky/zvuk/pull/70) [`98235d6`](https://github.com/schmooky/zvuk/commit/98235d63cd2ab57f93ebee30f3c9cb32bb8e7ba4) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix `Reverb` bypass. Bypassing now passes the dry signal at unity gain and silences the wet path — it previously left dry at `1 - wet`, so a "bypassed" reverb attenuated the signal by up to ~3 dB. Un-bypassing restores the configured/last-set wet mix instead of snapping to a hardcoded `0.3`, and `setWet` called while bypassed is remembered and applied when the effect is re-enabled.

## 1.12.0

### Minor Changes

- [#44](https://github.com/schmooky/zvuk/pull/44) [`7b3a2ab`](https://github.com/schmooky/zvuk/commit/7b3a2abda739febec4047a9075df2ebc48fa562e) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Snapshot blend — interpolate the live mix between two captured snapshots.

  ```ts
  const calm = engine.captureSnapshot("calm");
  // ...set the mix to its combat shape, then capture again.
  const combat = engine.captureSnapshot("combat");

  // Snap the live mix to lerp(calm, combat, t).
  engine.blendSnapshots(calm, combat, 0.4);

  // Drive it from a Parameter — bus levels and parameter values follow per-frame.
  const tension = engine.parameter("tension", 0);
  tension.subscribe((t) => engine.blendSnapshots(calm, combat, t));
  tension.set(0.75);
  ```

  - **`engine.blendSnapshots(a, b, t)`** — snaps every bus level and parameter value to `lerp(a, b, t)`. `t` is clamped to `[0, 1]`. Each call is instant (the 10 ms anti-click ramp on `bus.level` still applies), so calling it on every frame is cheap.
  - **`snapshot.blendWith(other, t)`** — same operation as a method on `Snapshot`, mirroring `apply()`.
  - Buses or parameters present in only one of the two snapshots are skipped. Mute flips at `t = 0.5` rather than interpolating, since the flag is binary.
  - For one-shot crossfades with a fade duration, `snapshot.apply({ fade })` is unchanged — `blendSnapshots` is the continuous-knob sibling.

  New `examples/snapshot-blend/` shows the pattern end-to-end: two looping layers, a slider drives a `tension` parameter that interpolates between a `calm` and `combat` snapshot.

## 1.11.1

### Patch Changes

- [#42](https://github.com/schmooky/zvuk/pull/42) [`818bbd9`](https://github.com/schmooky/zvuk/commit/818bbd9235c1c80543ce7b8dd2122c1b9eb613be) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Drop `eventemitter3` runtime dependency.

  It was declared in `dependencies` but never imported anywhere in the package — a leftover that slipped in by mistake. `Voice` cue listeners use a plain `Set<fn>` walker, not an `EventEmitter`. zvuk now has zero runtime dependencies, matching the pitch in the README.

## 1.11.0

### Minor Changes

- [#40](https://github.com/schmooky/zvuk/pull/40) [`7279123`](https://github.com/schmooky/zvuk/commit/7279123a19f2510f65a524067022b3b10672cfa1) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - DX wins — five small, mutually-independent additions.

  ```ts
  // 1) Variants — bundle N alternates, picker keeps SFX from sounding robotic.
  await engine.loadVariants(
    "coin",
    [
      ["/sfx/coin-1.webm", "/sfx/coin-1.m4a"],
      ["/sfx/coin-2.webm"],
      ["/sfx/coin-3.webm"],
    ],
    { bus: "sfx", strategy: "no-repeat" } // 'random' | 'no-repeat' | 'shuffle-bag'
  );
  engine.variants("coin").play();

  // 2) Fade-in on play — dual of the click-free stop fade.
  engine.sound("ambience").play({ loop: true, volume: 0.7, fadeIn: 0.5 });

  // 3) Explicit unload — drops the sound AND evicts its buffer from the LRU.
  engine.unloadSound("coin"); // evictBuffer: true (default)
  engine.unloadSound("coin", { evictBuffer: false }); // registry only

  // 4) Latency hint — maps to AudioContext.latencyHint.
  const engine = createEngine({
    buses: { music: {}, sfx: {} },
    latencyHint: "interactive", // | 'playback' | 'balanced' | number
  });

  // 5) Branded BusName — engine.bus(name) types against your declared buses.
  const engine = createEngine({ buses: { music: {}, sfx: {} } });
  engine.bus("music"); // ✓
  engine.bus("sxf"); // ✗ Type Error: Argument of type '"sxf"' is not assignable
  //   to parameter of type '"music" | "sfx"'.
  ```

  - **`engine.loadVariants(name, urls, options)` + `Variants`** — picker strategies are `'random'`, `'no-repeat'` (default), `'shuffle-bag'`. The `'no-repeat'` and `'shuffle-bag'` paths handle the spam-feel-robotic problem every casino slot hits without users rolling their own shufflers.
  - **`PlayOptions.fadeIn`** — voice ramps from 0 → volume over the configured window. Eliminates the `play({ volume: 0 }) + voice.fade({ to, duration })` two-step that ambient layers needed.
  - **`engine.unloadSound(name, { evictBuffer? })`** — explicit eviction sibling to `removeSound`. Active voices keep playing until they end naturally; only future `play()` calls are affected. `evictBuffer` defaults to `true`.
  - **`createEngine({ latencyHint })`** — forwards to `AudioContextOptions.latencyHint`. Slot games doing 60 fps reactive audio want `'interactive'`; long music players want `'playback'`. Browsers honour numeric values on a best-effort basis.
  - **Branded `BusName` types.** `Engine` and `EngineConfig` are generic in `TBusName`. Pass a literal `buses` map and `engine.bus(name)` type-checks against the keys you declared. Fully backwards-compatible — pass an `EngineConfig` typed as `string` (the default) and `engine.bus()` accepts any string.

  Voice and Loading concept pages picked up the new sections.

## 1.10.0

### Minor Changes

- [#38](https://github.com/schmooky/zvuk/pull/38) [`ba8865a`](https://github.com/schmooky/zvuk/commit/ba8865a4310d994b4abeb639a2e8591e988418f7) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Spatializer 3D config exposed, plus a single-knob occlusion parameter.

  ```ts
  // 3D config — previously hard-coded, now configurable per voice.
  engine.sound("engine").play({
    spatializer: {
      position: [10, 0, 0],
      refDistance: 5, // full volume within 5 units
      maxDistance: 250,
      rolloffFactor: 1.5,
      distanceModel: "inverse", // 'linear' | 'inverse' | 'exponential'
      occlusion: 0, // 0..1 — "behind a wall" knob
    },
  });

  // Live setters for moving sources / dynamic environments.
  v.spatializer?.setRefDistance(8);
  v.spatializer?.setMaxDistance(500);
  v.spatializer?.setRolloffFactor(2);
  v.spatializer?.setDistanceModel("linear");
  v.spatializer?.setOcclusion(0.7);
  ```

  Two related changes:

  - **3D config exposed.** `refDistance`, `maxDistance`, `rolloffFactor`, and `distanceModel` are now `SpatialOptions` fields and have matching live setters on `Spatializer`. Previously these were hard-coded to `(1, 1000, 1, 'inverse')`. Defaults match Web Audio sensible values (`(1, 10000, 1, 'inverse')`); existing code is unaffected unless it relied on the slightly tighter `maxDistance` of 1000.
  - **Occlusion knob.** A new `occlusion: 0..1` field on `SpatialOptions`, plus `setOcclusion(amount)` on `Spatializer`. Drives an internal `BiquadFilterNode` lowpass (cutoff sweeps log-style from 22050 Hz to ~500 Hz) plus a gain stage (-6 dB at amount = 1). Independent of distance attenuation; bind a single `Parameter` to both `setOcclusion` and a position update if you want one knob to drive both.

  3D Spatializers gain one extra `BiquadFilterNode` + `GainNode` per voice for the always-on (but transparent at occlusion = 0) occlusion chain. 2D StereoPanner spatializers are unchanged.

  Documented on the Spatializer concept page.

## 1.9.0

### Minor Changes

- [#36](https://github.com/schmooky/zvuk/pull/36) [`102a8fb`](https://github.com/schmooky/zvuk/commit/102a8fb2b6bf226505a37c96021af57972cb2481) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Routing primitives — bus sends, solo, bus groups, and a master meter.

  ```ts
  // Send a configurable share of one bus into another.
  const verbSend = engine
    .bus("music")
    .send(engine.bus("reverb"), { amount: 0.3 });
  verbSend.amount = 0.5; // setter ramps over 10 ms
  await verbSend.fadeTo(0, 1.2); // smooth fade-out
  verbSend.dispose(); // remove

  // Solo any subset of buses; engine coordinates the global mute-the-rest rule.
  engine.bus("voice").solo();
  engine.bus("music").solo(); // additive — both still audible
  engine.bus("voice").unsolo(); // music still soloed; everyone else still muted

  // Address several buses with a single handle.
  const combat = engine.busGroup("combat", [
    engine.bus("weapons"),
    engine.bus("enemies"),
    engine.bus("environment"),
  ]);
  combat.level = 0.5; // applied to every member
  await combat.fadeTo(0, 0.8); // fades every member in parallel
  combat.solo(); // solos every member at once

  // Live amplitude readout on the master output — same shape as bus.meter().
  const m = engine.masterMeter(); // → { rms, peak }
  ```

  Four additions, all sharing the routing/mixing theme:

  - **`bus.send(target, { amount, post })`** — the Wwise primitive the README has been claiming. Each `send` returns a `Send` handle with live `amount`, `fadeTo()`, and `dispose()`. Default tap is post-fader / post-FX; pass `post: false` for monitor-style pre-fader sends. Sends route into the target's `input`, so the target's FX chain and concurrency rules apply naturally.
  - **`bus.solo()` + `bus.unsolo()`** — engine maintains the global solo set. While any bus is soloed, every non-soloed bus is muted via a 10 ms ramp; when the set drains, every bus is restored. Solo state is independent of `muted` — un-soloing returns each bus to its own user-visible mute state, not unconditionally to "audible". Multiple solos are additive.
  - **`engine.busGroup(name, members)` / `engine.busGroup(name)`** — a `BusGroup` is a logical handle, not an audio node. Setting `group.level`, calling `group.fadeTo()`, `group.muted = true`, or `group.solo()` applies to every member in parallel. Doesn't change the audio graph; pure convenience for sub-mixes that always move together.
  - **`engine.masterMeter()`** — same `{ rms, peak }` readout as `bus.meter()` and `voice.level()`, just at the top of the chain. Lazy AnalyserNode tap on `master.input`.

  The Bus concept page on the docs site picks up four new sections covering each.

## 1.8.0

### Minor Changes

- [#34](https://github.com/schmooky/zvuk/pull/34) [`d224167`](https://github.com/schmooky/zvuk/commit/d2241673f5947cf5b6032a6eaa053f0a1719e3be) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add the `Music` source — stinger → loop → outro, the pattern every casino slot, action game, and rhythm game uses for combat/win/menu music.

  ```ts
  await engine.loadMusic(
    "boss-theme",
    {
      intro: ["/music/boss-intro.webm", "/music/boss-intro.m4a"],
      loop: ["/music/boss-loop.webm", "/music/boss-loop.m4a"],
      outro: ["/music/boss-outro.webm", "/music/boss-outro.m4a"],
    },
    { bus: "music", loopCrossfade: 0.05 }
  );

  const m = engine.music("boss-theme").play({ volume: 0.7, fadeIn: 0.2 });
  // → intro plays once, then the loop runs forever.

  m.skipToOutro(); // → finishes current loop iteration, plays outro, ends
  m.skipToOutro({ at: "now" }); // → fades loop (~50 ms), starts outro immediately
  m.stop(); // → click-free fade-out, no outro

  await m.ended;
  ```

  Each part accepts a single URL or a codec ladder, loaded through the same decoder cache and `resolveAsset` hook as `loadSound`. The intro and outro are both optional — a loop-only manifest works the way a regular looping sound does today, and `skipToOutro()` on a loop-only asset falls through to a clean stop so calling code doesn't have to branch on `music.hasOutro`.

  `loopCrossfade` carries through to the loop body (same equal-power-at-the-boundary trick from v1.5's `PlayOptions.loopCrossfade`), so non-zero-crossing loop regions don't click on takeover.

  A new vanilla example `examples/music-stinger-loop-tail/` wires it up end-to-end with start/skip-to-outro · loop-end/skip-to-outro · now/hard-stop buttons and a part-state indicator. The Music concept page on the docs site walks through the API surface and the two skip-to-outro modes.

  Drive-by: deleted three pre-existing lint warnings (`_baseLevel` unused field on Bus, template-literal nit in CLI transcode, optional-chain nit in codecs).

## 1.7.3

### Patch Changes

- [#32](https://github.com/schmooky/zvuk/pull/32) [`fdd04e6`](https://github.com/schmooky/zvuk/commit/fdd04e66b65ef3d76dbc6ab85ac7189fed472901) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Spectrum bars on every interactive docs demo (was: time-domain oscilloscope), plus a `bars-stereo` variant for the SpatialPanner.

  Bars read better than the oscilloscope across the whole site — pulses with the music, makes filter sweeps and pitch shifts visibly obvious, looks consistent. The 13 non-spatial demos (`BusFader`, `CompressorPlayground`, `CrossfadeDemo`, `MixerDashboard`, `ParameterModulator`, `PitchStretch`, `ReverbWet`, `SlotReel`, `SnapshotCrossfade`, `SoundCard`, `VoiceJitter`, `VoiceLimit`, `CrossfadeDemo`) all use the standard mono spectrum.

  `SpatialPanner` is the one demo where the mono sum hides what's happening — pan all the way left and the summed spectrum is identical to centred. So the panner now uses a new `bars-stereo` variant: `<Waveform>` splits the source through a `ChannelSplitterNode` and runs an analyser per channel, rendering L and R spectra side-by-side with a hairline divider. As you drag the puck, you watch the L bars grow while the R bars shrink, which is the actual demo.

  No public API change; docs-site polish only.

## 1.7.2

### Patch Changes

- [#30](https://github.com/schmooky/zvuk/pull/30) [`5449941`](https://github.com/schmooky/zvuk/commit/5449941ae3cd4d99a924eaf61551ec2903d60d91) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Live waveform overlays on every interactive docs demo.

  Each playable component on the docs site now renders a real-time oscilloscope (or, for the FilterSweep demo, a frequency-domain spectrum) on the bus the demo routes audio through. As you drag a slider, toggle bypass, fire a voice, or pan a sound, you see the signal change immediately — not just hear it.

  Wired into all 14 docs demos: `BusFader`, `CompressorPlayground`, `CrossfadeDemo`, `FilterSweep`, `MixerDashboard` (per-bus mini-meters), `ParameterModulator`, `PitchStretch`, `ReverbWet`, `SlotReel`, `SnapshotCrossfade`, `SoundCard`, `SpatialPanner`, `VoiceJitter`, `VoiceLimit`.

  Implementation is a small `<Waveform audioNode={busNode} />` React component that lazily attaches its own AnalyserNode as a passive sibling of the source node — no engine change, no audio-path change. Cleans up on unmount or when the source changes.

  No public API change; docs-site polish only.

## 1.7.1

### Patch Changes

- [#28](https://github.com/schmooky/zvuk/pull/28) [`595a8eb`](https://github.com/schmooky/zvuk/commit/595a8eb1b65f0144894ac7007ff5800ecd76dea9) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Render changelog markdown on the docs site.

  The `/changelog/` page was dumping each entry's body inside a `<pre>` tag, so bullets, bold, fenced code blocks, and links rendered as raw markdown noise (`- **Foo**` instead of a styled list). Two fixes:

  - The build script (`docs/scripts/build-changelog.mjs`) now passes each bullet body through `marked` and stores the rendered HTML alongside the original markdown. Build-time only — no markdown parser ships to the browser. The parser also keeps blank lines between indented continuation lines so paragraphs in long entries don't get squished into a single block.
  - The `/changelog/` Astro page injects the pre-rendered HTML through `set:html` and styles it with a scoped `.changelog-prose` block so paragraphs, lists, code spans, and fenced code all render properly.

  No public API change — purely a docs-site fix.

## 1.7.0

### Minor Changes

- [#26](https://github.com/schmooky/zvuk/pull/26) [`2a3f6a9`](https://github.com/schmooky/zvuk/commit/2a3f6a968755a18e6512e0aae63e2f623ff1e3fb) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Live amplitude meters on Voice and Bus, plus a `rhythm-metronome` example.

  ```ts
  // Per-voice readout — lazy AnalyserNode tap on the voice's gain stage.
  const v = engine.sound("hit").play();
  v.level(); // → { rms: 0.18, peak: 0.42 }   linear, in [0..1]

  // Per-bus readout — same shape, on bus output.
  engine.bus("music").meter();
  ```

  Both methods return `{ rms, peak }` as linear values in `[0..1]`. The first call on each instance lazily attaches an AnalyserNode as a passive sibling of the existing audio path — no cost until you read, no signal flow change.

  Three things ship together because they share the same primitive:

  - **`voice.level()`** — drives per-voice clip indicators, custom voice-stealing rules, or "loudest voice in the mix" UI.
  - **`bus.meter()`** — drives mixer-dashboard VU meters and automation that reacts to bus level.
  - **`'quietest'` voice steal works for real now.** Previously it logged a console warning and silently fell back to `'oldest'` (per the v1.4.0 changelog). With per-voice levels available it now does what the docs said all along: when the bus hits its concurrency limit, the voice with the lowest live RMS is stolen. The fallback warning is gone.

  A new vanilla example, `examples/rhythm-metronome/`, ties it together: sample-accurate clicks via `engine.scheduleAt`, a live VU bar driven by `bus.meter()`, and a per-voice peak meter showing `voice.level()` on the most-recently-fired voice. BPM control with drift-free re-anchoring.

  Documented on the Voice and Bus concept pages.

## 1.6.0

### Minor Changes

- [#24](https://github.com/schmooky/zvuk/pull/24) [`d7b94de`](https://github.com/schmooky/zvuk/commit/d7b94de82378808ecaee18f9fdefc6f679a38828) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add `engine.preload(items, options)` — a first-class bulk loader for loading screens.

  ```ts
  await engine.preload(
    [
      {
        name: "coin",
        url: ["/sfx/coin.webm", "/sfx/coin.m4a"],
        options: { bus: "sfx" },
      },
      {
        name: "win",
        url: ["/sfx/win.webm", "/sfx/win.m4a"],
        options: { bus: "sfx" },
      },
      // ... 100 more items
    ],
    {
      concurrency: 4,
      onProgress: ({ name, status, completed, total }) => {
        bar.value = completed / total;
      },
    }
  );
  ```

  The DIY `Promise.all(items.map(loadSound))` pattern works fine for small batches, but breaks down once you ship a real loading screen: every adopter writes the same boilerplate for per-item progress, a concurrency cap so the rest of the page's network isn't starved, and aggregated failure reporting. `engine.preload` provides all three:

  - **Per-item progress** via `onProgress({ name, status, completed, total })`. `completed / total` is your loading-bar fraction.
  - **Concurrency cap** (default `4`) — caps in-flight fetches so the browser's per-host connection budget (typically 6) isn't fully consumed by audio.
  - **Aggregated failures** — the promise rejects with `PreloadError` only after every item has settled, exposing `.failures: { name, cause }[]`. A single broken asset doesn't short-circuit the rest of the screen.
  - **Cancellable** via `options.signal` — pending items aren't started, in-flight fetches receive the abort.

  Item shape mirrors `loadSound` one-for-one (`{ name, url, options? }`), so existing manifests can be passed through without massaging the data first.

  Documented in the "Loading sounds" guide.

## 1.5.0

### Minor Changes

- [#22](https://github.com/schmooky/zvuk/pull/22) [`cfb8ade`](https://github.com/schmooky/zvuk/commit/cfb8ade7ac075ed81a924ce1ccdc20a1cc393536) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add `loopCrossfade` play option for click-free music loops.

  ```ts
  engine.sound("music-bed").play({
    loop: true,
    loopStart: 0.04,
    loopEnd: 31.96,
    loopCrossfade: 0.05, // 50 ms equal-power overlap at the loop boundary
  });
  ```

  AudioBufferSourceNode's native loop is a hard cut from `loopEnd` back to `loopStart`. If those points don't land on a zero crossing, every loop iteration produces an audible click — the kind of thing a sample editor would normally have you fix at edit time. `loopCrossfade` does it at runtime instead: zvuk spawns a parallel buffer source one crossfade-window before each boundary and equal-power-ramps between them.

  **Off by default.** Existing `loop: true` voices keep using AudioBufferSourceNode's native single-source loop — no behaviour or cost change unless you opt in. When opted in:

  - Each loop iteration costs one extra `AudioBufferSourceNode` + `GainNode`. With default Web Audio dispatch this is well under 1% CPU per voice on commodity hardware.
  - Silently falls back to native loop if `loop` is false, or if the loop region is shorter than 2× the crossfade window.
  - Works alongside everything else on Voice — `pause`/`resume` re-enters a fresh chain, `setPlaybackRate` fans out across every live segment, `stop()` tears the chain down with the usual click-free fade.

  Documented on the Voice concept page.

## 1.4.0

### Minor Changes

- [#20](https://github.com/schmooky/zvuk/pull/20) [`419b817`](https://github.com/schmooky/zvuk/commit/419b817b018566257f88575cd27a13899c7446fb) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Three small cleanups surfaced in an audit pass.

  - **`Filter.bypassed` actually bypasses now.** Previously, toggling `bypassed = true` set the biquad's frequency to 22050 Hz — which still ran the filter and let its delay-line state bleed into the dry signal. Bypass now mirrors `Compressor.bypassed`: a real graph rewire that detaches the biquad and connects `input → output` directly. Two unused `GainNode`s (`bypassPath`, `direct`) were also removed. Public shape is unchanged: `Filter` still implements `FxInsert` with `input` / `output` / `bypassed` / `dispose`, but `input !== output` now (separate gain nodes spliced around the biquad).
  - **`'quietest'` voice-stealing logs an honest fallback warning.** The strategy advertised in `ConcurrencyConfig['steal']` was silently behaving like `'oldest'` because Voice doesn't expose a level meter yet. It still falls back, but now logs a one-shot `console.warn` explaining that real metering ships in a follow-up release. Use `'lowest-priority'` if you need explicit control today; `'quietest'` becomes a no-warn, real implementation when per-voice meters land.
  - **`BankNotLoadedError` removed.** The class was exported from the public API but never thrown — the CLI's generated `loadBank()` is just a loop over `engine.loadSound`, so a dedicated bank error wasn't doing any work. If you were `import`-ing it, you can drop the import.

## 1.3.0

### Minor Changes

- [#18](https://github.com/schmooky/zvuk/pull/18) [`c672522`](https://github.com/schmooky/zvuk/commit/c672522052e5a7b4a02a5e001e7dd9ac081d21a3) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add `createEngine({ resolveAsset })` — a generic hook for adopting buffers from an external asset system (Pixi `Assets.cache`, IndexedDB, manifest, custom loader) instead of (or alongside) zvuk's URL fetcher. Plus a "Asset resolution" guide with full recipes.

  ### Why

  Most apps already have an asset system. Forcing zvuk to also fetch and decode the same audio file means double the download, double the RAM, and weird race conditions on the loading screen. The new resolver hook lets you point zvuk at whatever you already use, without zvuk depending on any of it.

  ### Shape

  ```ts
  import { createEngine, type AssetResolver } from "@schmooky/zvuk";

  const resolveAsset: AssetResolver = ({ name, url, signal }) => {
    // Return one of:
    //   AudioBuffer    — used as-is, no decode
    //   ArrayBuffer    — decoded via the engine's AudioContext
    //   string         — treated as a URL, fetched + decoded normally
    //   undefined/null — explicit miss; falls through to the URL list
  };

  const engine = createEngine({ buses: { sfx: {} }, resolveAsset });
  ```

  The resolver runs before any fetch on every `loadSound` / `loadSprite` call. Returning `undefined`/`null` falls through to the URL list passed to `loadSound`, so resolvers can mix cached and uncached sounds without branching at the call site.

  ### Recipes covered in the guide

  - **Pixi v8 + assetpack** — pull buffers straight out of `Assets.cache`, so the existing Pixi loading-screen progress bar drives audio downloads too. (A real example app will ship separately with slotplate.)
  - **IndexedDB persistent cache** — fetch the first time, hydrate from the DB on returning users. Useful for slot machines and kiosk apps that load the same audio set repeatedly.
  - **In-memory `Map` cache** — full control over eviction, useful for service-worker / build-time-inlined buffers.
  - **Manifest-driven URLs** — ship one JSON mapping logical names to hash-busted URLs.

  ### Scope

  Applies to `loadSound` and (transitively) `loadSprite`. `loadStream` is HTMLAudioElement-backed and doesn't decode buffers, so it stays on direct URL consumption — covered by a pitfall callout in the guide.

## 1.2.0

### Minor Changes

- [#16](https://github.com/schmooky/zvuk/pull/16) [`c63f9f5`](https://github.com/schmooky/zvuk/commit/c63f9f5e7d66481fb3d0c28db92781a8b055c601) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add opt-in `tickSource` injection so the scheduler can dispatch JS callbacks from a host's existing render loop (Pixi `app.ticker`, GSAP `gsap.ticker`, custom rAF) instead of `setTimeout`. Also expose the existing visibility-driven AudioContext suspend as a configurable `autoPauseOnHidden` flag, and add a "Runtime timing" guide that documents the full timing model.

  ### Why

  `engine.scheduleAt(audioTime, fn)` and voice region timers previously used `setTimeout` exclusively. Browsers throttle `setTimeout` to ~1 Hz on hidden tabs, so callbacks scheduled to fire while the tab is hidden land late. Audio playback itself is unaffected — Web Audio runs on its own thread and zvuk stamps fade ramps and source starts directly with audio time — but the JS-side confirmation callbacks lag.

  Spinning up a parallel `requestAnimationFrame` loop inside the library would be the wrong fix: it doesn't help on hidden tabs (rAF pauses entirely there, worse than `setTimeout`'s 1 Hz throttle), and it burns frames in hosts that already have a render loop. Better to let consumers wire zvuk into the loop they already run.

  ### Ticker injection

  ```ts
  import { Application } from "pixi.js";
  import { createEngine, type TickSource } from "@schmooky/zvuk";

  const app = new Application();
  await app.init({
    /* ... */
  });

  const tickSource: TickSource = {
    subscribe(handler) {
      app.ticker.add(handler);
      return () => app.ticker.remove(handler);
    },
  };

  const engine = createEngine({ buses: { sfx: {} }, tickSource });
  ```

  `TickSource` is a minimal `subscribe(handler) → unsubscribe` shape — anything you can `add(handler)` and later `remove(handler)` from is a valid source. The scheduler subscribes lazily (only while there are pending tasks) so a 60 Hz host loop isn't waking it 60 times a second to do nothing. Without a `tickSource`, the scheduler keeps using `setTimeout`.

  ### `autoPauseOnHidden`

  The engine has always suspended the AudioContext on `visibilitychange === 'hidden'` and resumed on return — primarily as the iOS Safari reliability workaround for suspension-on-blur. That behaviour is now exposed as `createEngine({ autoPauseOnHidden: false })` for music players and background-audio apps that want playback to continue across tab switches. Default remains `true`, so existing code is unaffected.

  ### Docs

  New `/guides/runtime-timing/` page covers the JS-vs-audio timing split, why we don't run an internal rAF, the Pixi / GSAP / custom-rAF recipes, and how to pick a strategy per use case.

## 1.1.0

### Minor Changes

- [#14](https://github.com/schmooky/zvuk/pull/14) [`6587a92`](https://github.com/schmooky/zvuk/commit/6587a9252da2332ea024ebc07a53e82c520a10f0) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Apply a short click-free fade-out before `voice.stop()` actually cuts the source node, eliminating the digital click that fires when Web Audio stops a buffer mid-waveform on a non-zero crossing.

  `Voice.stop()` previously called `source.stop()` directly, which on the audio thread translates to "discontinue this sample stream right now." If the waveform happened to be at e.g. 0.7 amplitude when the stop landed, the abrupt jump to zero produces a broadband click — most audible on bass-heavy material, looped sustains, and any voice cut by stealing or a region timer.

  The new path schedules a tiny linear gain ramp to 0 (default 8 ms) on the voice's gain stage, then schedules `source.stop(stopAt)` so the source actually stops once the ramp lands. The voice's `.ended` promise resolves after the ramp completes; the engine's voice tracking sees the same termination it always did. Re-entrant `stop()` calls during an in-progress fade are no-ops — the first stop wins.

  ### Configuration

  - **Engine default:** `createEngine({ voice: { stopFade: 0.008 } })`. Set to `0` to disable globally and restore the old hard-stop behaviour.
  - **Per-call override:** `voice.stop({ fade: 0.05 })` for a longer tail, or `voice.stop({ fade: 0 })` for an immediate hard cut (sample-accurate timing, intentional staccato).

  The same fade applies to all stop paths: explicit `stop()`, `AbortSignal` abort, region-timer expiry, and concurrency-driven voice stealing.

  `pause()` is intentionally untouched in this release — the maintainer is reworking pause semantics in a follow-up. Pause/resume continues to do a hard-stop on the source node as before.

## 1.0.1

### Patch Changes

- [#12](https://github.com/schmooky/zvuk/pull/12) [`40ea9af`](https://github.com/schmooky/zvuk/commit/40ea9af1b1195f43c2b2413754f853e4995fb8f4) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fall through to the next URL on fetch / decode failure when loading an audio asset with a fallback list (codec ladder).

  `engine.loadSound('coin', ['coin.webm', 'coin.m4a'])` previously selected one URL upfront via `pickSource()` and threw `DecodeError` immediately if that single URL 404'd, hit a network error, or failed to decode — even if the other URL would have worked. The codec ladder only protected against codec capability, not transport failures, so a stale CDN entry or under-reported `canPlayType` could brick a sound that had a perfectly good fallback sitting next to it in the array.

  `Decoder` now exposes `loadFirst(urls, opts)` which walks the list in order (codecs the browser claims it can play float to the front via the new `pickSourceOrder()`), and falls through on per-URL fetch/decode failures. The first URL that successfully fetches AND decodes wins. `AbortError` from `opts.signal` is fatal and propagates verbatim — once the caller pulled the plug we don't keep trying. A cache fast-path scans every URL in the list before any fetch, so a previously-resolved fallback short-circuits without re-hitting the network.

  When every URL fails, a new `AggregateDecodeError` is thrown with per-URL causes attached on `attempts`. It's a subclass of `DecodeError`, so existing `catch (e instanceof DecodeError)` paths still fire. Single-URL failures rethrow the underlying `DecodeError` verbatim — no behavioural change for callers that don't pass an array.

## 1.0.0

### Major Changes

- [#9](https://github.com/schmooky/zvuk/pull/9) [`b5a82cb`](https://github.com/schmooky/zvuk/commit/b5a82cbc6c289e7df1c85f471ecdc8c22e76ee27) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Normalize all time-valued options to **seconds** to match the Web Audio API. This is a breaking change.

  `PlayOptions`, `CompressorConfig`, `MasterLimiterConfig`, and `ReverbConfig` already used seconds. `FadeOptions`, `CrossfadeOptions`, `SnapshotOptions`, `DuckerConfig`, and `SidechainConfig` previously mixed milliseconds in. They now all take seconds, and a few field names changed to remove the `ms` suffix.

  ### Migration

  Old call → new call:

  | Before                                               | After                                                  |
  | ---------------------------------------------------- | ------------------------------------------------------ |
  | `voice.fade({ to, ms: 800 })`                        | `voice.fade({ to, duration: 0.8 })`                    |
  | `stream.fade({ to, ms: 800 })`                       | `stream.fade({ to, duration: 0.8 })`                   |
  | `voice.setPlaybackRate(r, { ms: 800 })`              | `voice.setPlaybackRate(r, { duration: 0.8 })`          |
  | `bus.fadeTo(target, 800)`                            | `bus.fadeTo(target, 0.8)`                              |
  | `engine.crossfade(from, to, { ms: 1500 })`           | `engine.crossfade(from, to, { duration: 1.5 })`        |
  | `snapshot.apply({ fadeMs: 250 })`                    | `snapshot.apply({ fade: 0.25 })`                       |
  | `new Ducker(ctx, src, { attack: 80, release: 400 })` | `new Ducker(ctx, src, { attack: 0.08, release: 0.4 })` |
  | `sidechain: { attack: 80, release: 400 }`            | `sidechain: { attack: 0.08, release: 0.4 }`            |

  Mechanical fix in most call sites: divide every existing time value by 1000 and rename `ms` → `duration` (or `fadeMs` → `fade`).

  ### Why

  Web Audio is the underlying runtime, and it speaks seconds everywhere — `AudioContext.currentTime`, every `AudioParam` schedule call, `setValueAtTime`, `linearRampToValueAtTime`, `setValueCurveAtTime`. Mixing milliseconds in user-facing options forced a `* 1000` / `/ 1000` conversion at every boundary and made it easy to pass the wrong unit when copy-pasting across APIs (e.g. `Compressor` vs `Ducker` both have `attack`/`release`, but they were in different units). Aligning on seconds removes that whole class of bug.

## 0.2.0

### Minor Changes

- [#6](https://github.com/schmooky/zvuk/pull/6) [`490d822`](https://github.com/schmooky/zvuk/commit/490d822dd75fc343e9b544b802aad9d321049a87) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Handle iOS Safari `AudioContext` interruptions (phone calls, Siri, system
  audio takeovers).

  iOS Safari moves the `AudioContext` into a non-standard `'interrupted'` state
  during these events; `resume()` does not recover from it. Without explicit
  handling, voices hang silently until the page is reloaded.

  The `AudioContextHost` now subscribes to the context's `statechange` event:

  - On transition into `'interrupted'`, a new `'interrupted'` engine state is
    emitted via `onStateChange`, so apps can render an "audio paused" indicator.
  - When the OS releases the interruption (`'interrupted'` → `'suspended'`),
    the host auto-resumes after a 200 ms beat — the same idiom used for
    visibility-driven suspends.
  - Once the context returns to `'running'`, the engine state goes back to
    `'live'`.

  **Breaking:** `EngineState` adds an `'interrupted'` arm. Code doing exhaustive
  `switch` on engine state needs an additional case (TypeScript will surface
  this).

### Patch Changes

- [#7](https://github.com/schmooky/zvuk/pull/7) [`12b6e46`](https://github.com/schmooky/zvuk/commit/12b6e46e1c32713dfe9d560cb8d2b8416862e0bf) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix `Ducker.dispose()` leaking the analyser node into its source bus.

  The Ducker constructor wires `sourceBus.output → analyser` to read RMS off
  the source bus, but the previous `dispose()` only disconnected the analyser's
  _outgoing_ side. The source bus retained its outbound edge to the analyser,
  so the analyser (and its 1024-sample `Float32Array` envelope buffer) stayed
  alive for the entire lifetime of the bus — long-running games (slot
  machines, music apps) would accumulate one of these per Ducker swap.

  `dispose()` now stores the source bus on the instance and tears down the
  inbound edge first via `sourceBus.output.disconnect(this.analyser)`.

  Also extends the happy-dom Web Audio mock so `AudioNode.disconnect(target)`
  honours its target argument (it previously cleared all outgoing edges
  regardless), and adds `setTargetAtTime` to `FakeAudioParam` so Ducker's
  envelope follower can run under tests.

- [#8](https://github.com/schmooky/zvuk/pull/8) [`e29b8da`](https://github.com/schmooky/zvuk/commit/e29b8da94956f4efb1f2a48ba3db410064bf4d41) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Add unit-test coverage for `Snapshot` — capture / apply / mute restore /
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

- [#4](https://github.com/schmooky/zvuk/pull/4) [`48e4155`](https://github.com/schmooky/zvuk/commit/48e41554cc28ad5b5de64d8c3f3c4ae3e3c2e068) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix `Voice` invoking the engine's internal `onEnded` callback twice on natural
  end of non-looped sources.

  The voice constructor wired the engine cleanup hook both through
  `bindSourceLifecycle` (sync, when `AudioBufferSourceNode.onended` fires) and
  through `this.ended.then(...)` (microtask, when `finish()` resolves the
  `ended` promise). `stop()`, abort signals, and the region timer all flowed
  through only the promise path, so natural end was the lone asymmetric case.

  Engine and Bus voice tracking use `Set.delete` so the duplicate was
  idempotent in practice — but it was a real correctness bug waiting to bite
  any callback that wasn't safe to call twice. All termination paths now fire
  exactly once via the promise.

## 0.1.1

### Patch Changes

- [`d252e30`](https://github.com/schmooky/zvuk/commit/d252e30e1023c667b36aa107298fb77e43bfd9fe) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Fix `homepage` in package.json to point at the actual docs deploy
  (`https://zvuk.schmooky.dev`). v0.1.0 shipped with the wrong URL, so
  the npmjs.com page links to a non-existent domain. No code changes —
  this republishes the manifest with the correct metadata.

  Bundled doc fixes that came in alongside the rename (carried so the
  release notes describe what landed on the docs site):

  - Navbar version pill is now dynamic — reads `package.json#version`
    via SITE.version, so it stays in sync with whatever changesets
    publishes.
  - Navbar adds an npm icon-button linking to the package page.
  - Footer npm link uses the scoped name (`@schmooky/zvuk`) instead of
    the rejected unscoped one.
  - `/changelog/` page now sources from the root `CHANGELOG.md`
    (one card per published version, grouped by bump, with commit SHA
    and `@author` per bullet, deep-linkable `#v<version>` anchors).
    Replaces the previous "list pending changesets" view, which only
    showed unreleased work.
  - Hero badge and "What's in v…" heading also bind to SITE.version.
  - docs/index "What's coming" list rewritten to point at the roadmap
    (it had been listing items that already shipped).

## 0.1.0

### Minor Changes

- [`4ed17e1`](https://github.com/schmooky/zvuk/commit/4ed17e1b2e645b2432d334ae865e0418592873a3) Thanks [@schmooky](https://github.com/schmooky)! - Initial Sprint 1 release: lazy AudioContext runtime, Master + named Buses, Sound + Voice with
  abort signals, codec-aware multi-source loading (`['sfx.webm', 'sfx.m4a']`), iOS-Safari resume
  dance, sample-accurate scheduler. Docs site with landing, quickstart, Engine concept page,
  asset-format guide, and a live Mixer Dashboard demo running on real assets.

- [`3b6e032`](https://github.com/schmooky/zvuk/commit/3b6e03287cdb71ccab29f179f972b7885f2af7cb) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Sweeps the public roadmap (Tiers 1–4) end-to-end:

  - Voice live control: `pause()`, `resume()`, `setPlaybackRate()`, exposed
    `voice.spatializer` for live `setPan` / `setPosition` while playing.
  - Audio sprites — one buffer, many named regions, one fetch — via
    `engine.loadSprite()` + `engine.sprite('cascade').play('match-3')`.
  - Stream source for long media via `engine.loadStream()` (HTMLAudioElement +
    MediaElementAudioSource), so multi-minute music tracks don't decode into RAM.
  - Loudness normalization: `loadSound(..., { normalize: true })` runs an
    RMS pass at decode and applies makeup gain (with peak ceiling).
  - Better error messages: BusNotFoundError / SoundNotFoundError now include a
    Levenshtein "did you mean?" suggestion when a close name exists.
  - Realtime time-stretch via AudioWorklet: `ensureStretchWorklet(ctx)` +
    `createStretchWorkletNode(ctx)` for live tempo automation.
  - Master limiter: `master.limiter` config (or `master.setLimiter(...)`) wires
    a fast-attack DynamicsCompressor on master out.
  - Crossfade helper: `engine.crossfade('intro', 'main', { ms })` — equal-power
    by default, picks up sourceName off the outgoing voices.
  - CLI: `npx zvuk transcode <glob>` (ffmpeg ladder) and
    `npx zvuk gen bank.json` (typed sound-name module).
  - Bench suite under `bench/` (vitest bench): voice spawn, decode + cache,
    fade drift.
  - Docs: TypeDoc-driven `/api/`, Pagefind ⌘K search, auto-built `/changelog/`,
    and per-page OG cards via astro-og-canvas.
  - Vanilla `examples/` (slot-machine, match-3, fps-footsteps) — no React/Vue.

### Patch Changes

- [`7fe93b9`](https://github.com/schmooky/zvuk/commit/7fe93b9854160f9b4aaa4f51e5182a3157b0afc3) Thanks [@igaming-bulochka](https://github.com/igaming-bulochka)! - Docs polish + agent-readable index:

  - `/llms.txt` route added (slotplate-style: H1, tagline, bulleted page index
    with descriptions). Linked from the top nav so both humans and crawlers
    hit it. Built from a single manifest in
    `docs/src/pages/llms.txt.ts` — keep it in sync when adding new docs pages.
  - Roadmap page rewritten: every Tier 1–4 item moved into a green
    "Recently shipped in v0.0.2" callout.
  - Concept and FX pages updated to describe the new APIs surfaced in the
    v0.0.2 sweep — sprite, stream, crossfade, master limiter, normalize,
    did-you-mean, pause/resume, setPlaybackRate, voice.spatializer live
    binding, realtime stretch worklet.
  - Loading guide expanded with stream/sprite/normalize/typed-banks sections.
  - SpatialPanner demo polished — pointer events + pointer capture (one path
    for mouse/touch/stylus), and now drives panning via the new
    `voice.spatializer.setPan()` ref instead of the v0 placeholder.
  - New `CrossfadeDemo` React island (Engine concept page) running a real
    `engine.crossfade()` between two music beds (`/audio/music-{a,b}.mp3`).
  - `examples/` (slot-machine, match-3, fps-footsteps) now use the casino
    SFX shipped under `docs/public/audio/` so the examples run with no
    extra setup. slot-machine streams the bed via `engine.loadStream`.
  - Kenney's "Digital Audio" pack (CC0) curated in under
    `docs/public/audio/` (laser/powerUp/phaseJump/zap, ×2 each), with
    attribution in the root README, examples README, and docs footer.
  - Build pipeline fixes: Search component switched to inline raw JS so
    Vite stops choking on `/pagefind/pagefind.js` at build time; OG route
    renamed `[slug].png.ts` → `[slug].ts` to fix the `*.png.png` filenames.
  - Tests: stream, crossfade source-filter precision, voice cues
    paused/resumed, stretch worklet (mocked). 40 tests pass.
