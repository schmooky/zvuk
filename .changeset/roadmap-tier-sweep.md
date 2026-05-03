---
'zvuk': minor
---

Sweeps the public roadmap (Tiers 1–4) end-to-end:

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
