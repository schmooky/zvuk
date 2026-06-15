---
"@schmooky/zvuk": patch
---

Fix `Reverb` bypass. Bypassing now passes the dry signal at unity gain and silences the wet path — it previously left dry at `1 - wet`, so a "bypassed" reverb attenuated the signal by up to ~3 dB. Un-bypassing restores the configured/last-set wet mix instead of snapping to a hardcoded `0.3`, and `setWet` called while bypassed is remembered and applied when the effect is re-enabled.
