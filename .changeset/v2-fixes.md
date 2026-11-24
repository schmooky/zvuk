---
"@schmooky/zvuk": patch
---

Fixes:

- `BusConfig.sidechain` was accepted and ignored; it now inserts a `Ducker` keyed on the `from` bus.
- Loop crossfade at pitch other than 1 sized its envelope and seams in buffer seconds and left a gap on every lap; a rate change now re-seams the chain.
- Pause and resume on a looping region wrapped by the buffer length and resumed outside the region.
- `'no-repeat'` variants could never pick the first take first; one-take bundles never set `lastPick`.
- Aborting a load and reloading the same URL at once joined the aborted fetch and failed.
- `bus.removeFx()` left the insert's output connected.
- A voice kept its abort listener on `play({ signal })` after it ended; preload left listeners on a batch signal.
- Returning to the tab resumed a context the app had suspended.
- `voice.fade()` after `stop()` overrode the stop ramp and clicked.
- Filter and reverb parameter changes and filter/compressor bypass clicked; they now glide or crossfade.
- Spatializer moves jumped and crackled; they now glide.
- The `BusGroup` doc claimed snapshots could target groups.
