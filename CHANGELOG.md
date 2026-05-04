# @schmooky/zvuk

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
