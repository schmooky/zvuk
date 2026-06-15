---
"@schmooky/zvuk": patch
---

Clarify that the realtime stretch worklet (`createStretchWorkletNode`) is **varispeed** — it shifts pitch and tempo together (tape-style), not pitch-preserving time-stretch like the offline `StretchProcessor`. Updated the module docs, README feature, and the pitch FX page to say so, and removed dead Hann-window code from the worklet processor that implied an overlap-add it never performed. No runtime behavior change.
