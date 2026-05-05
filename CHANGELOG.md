# @schmooky/zvuk

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
