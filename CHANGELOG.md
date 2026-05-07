# @schmooky/zvuk

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
