---
"@schmooky/zvuk": minor
---

Three small cleanups surfaced in an audit pass.

- **`Filter.bypassed` actually bypasses now.** Previously, toggling `bypassed = true` set the biquad's frequency to 22050 Hz — which still ran the filter and let its delay-line state bleed into the dry signal. Bypass now mirrors `Compressor.bypassed`: a real graph rewire that detaches the biquad and connects `input → output` directly. Two unused `GainNode`s (`bypassPath`, `direct`) were also removed. Public shape is unchanged: `Filter` still implements `FxInsert` with `input` / `output` / `bypassed` / `dispose`, but `input !== output` now (separate gain nodes spliced around the biquad).
- **`'quietest'` voice-stealing logs an honest fallback warning.** The strategy advertised in `ConcurrencyConfig['steal']` was silently behaving like `'oldest'` because Voice doesn't expose a level meter yet. It still falls back, but now logs a one-shot `console.warn` explaining that real metering ships in a follow-up release. Use `'lowest-priority'` if you need explicit control today; `'quietest'` becomes a no-warn, real implementation when per-voice meters land.
- **`BankNotLoadedError` removed.** The class was exported from the public API but never thrown — the CLI's generated `loadBank()` is just a loop over `engine.loadSound`, so a dedicated bank error wasn't doing any work. If you were `import`-ing it, you can drop the import.
