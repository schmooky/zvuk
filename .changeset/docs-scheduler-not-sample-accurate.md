---
"@schmooky/zvuk": patch
---

Stop labelling the scheduler "sample-accurate". It dispatches JS callbacks from a tick source (`setTimeout` or an injected ticker), so it is tick-bounded (ms-level), as its own docstring already noted. Reworded the README, `Scheduler` docs, and docs pages to "audio-clock scheduler", and corrected the claim that the `scheduleAt` callback receives an `audioTime` argument (it does not — close over the value you scheduled against).
