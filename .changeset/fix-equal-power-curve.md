---
"@schmooky/zvuk": patch
---

Fix the `equal-power` fade curve so crossfades stay at constant power. It previously applied a `sin²` gain symmetrically, dipping ~3 dB at the crossfade midpoint — the exact loudness dip equal-power is meant to remove. The curve is now direction-aware (rising legs follow `sin(t·π/2)`, falling legs `cos(t·π/2)`), so two opposing legs sum to unity power. Affects `engine.crossfade`, `Bus`/`Send` fades, `Snapshot.apply`, and `Parameter` bindings using `curve: 'equal-power'`.
