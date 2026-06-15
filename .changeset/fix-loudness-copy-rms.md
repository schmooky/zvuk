---
"@schmooky/zvuk": patch
---

Loudness normalization no longer mutates the source buffer in place — it scales into a fresh `AudioBuffer` when run through the engine, so a buffer adopted from a `resolveAsset` cache is left untouched. Also clarified that normalization matches **RMS level**, not perceptual/LUFS loudness, in the docs and `LoadSoundOptions.normalize`.
