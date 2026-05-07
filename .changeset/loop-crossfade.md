---
"@schmooky/zvuk": minor
---

Add `loopCrossfade` play option for click-free music loops.

```ts
engine.sound('music-bed').play({
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
