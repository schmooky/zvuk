---
"@schmooky/zvuk": patch
---

Fix `Ducker.dispose()` leaking the analyser node into its source bus.

The Ducker constructor wires `sourceBus.output → analyser` to read RMS off
the source bus, but the previous `dispose()` only disconnected the analyser's
*outgoing* side. The source bus retained its outbound edge to the analyser,
so the analyser (and its 1024-sample `Float32Array` envelope buffer) stayed
alive for the entire lifetime of the bus — long-running games (slot
machines, music apps) would accumulate one of these per Ducker swap.

`dispose()` now stores the source bus on the instance and tears down the
inbound edge first via `sourceBus.output.disconnect(this.analyser)`.

Also extends the happy-dom Web Audio mock so `AudioNode.disconnect(target)`
honours its target argument (it previously cleared all outgoing edges
regardless), and adds `setTargetAtTime` to `FakeAudioParam` so Ducker's
envelope follower can run under tests.
