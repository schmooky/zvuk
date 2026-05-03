# @schmooky/zvuk

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
