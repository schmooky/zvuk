---
"@schmooky/zvuk": patch
---

`Bus.dispose` now tears down the bus's sends and FX inserts. Previously a disposed bus left its `Send` GainNodes connected to their target buses (a node leak), since `engine.close` never iterated bus sends. `Bus.fx()` and `Bus.sends()` now return copies so callers can't mutate the live chain/send list.
