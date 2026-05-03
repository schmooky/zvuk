---
'zvuk': patch
---

Docs polish + agent-readable index:

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
