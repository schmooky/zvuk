---
"@schmooky/zvuk": patch
---

Fix `Bus.fadeTo` so it no longer overrides mute or solo. It previously wrote the output gain unconditionally, so fading a muted (or solo-veiled) bus audibly un-muted it. As a consequence, `Snapshot.apply` could not keep a bus captured as muted silent — the level fade un-muted it right after the mute was applied. `fadeTo` now stores the target level while silenced and applies it when the bus is unmuted/unveiled.
