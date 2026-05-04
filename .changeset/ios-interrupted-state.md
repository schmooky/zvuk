---
"@schmooky/zvuk": minor
---

Handle iOS Safari `AudioContext` interruptions (phone calls, Siri, system
audio takeovers).

iOS Safari moves the `AudioContext` into a non-standard `'interrupted'` state
during these events; `resume()` does not recover from it. Without explicit
handling, voices hang silently until the page is reloaded.

The `AudioContextHost` now subscribes to the context's `statechange` event:

- On transition into `'interrupted'`, a new `'interrupted'` engine state is
  emitted via `onStateChange`, so apps can render an "audio paused" indicator.
- When the OS releases the interruption (`'interrupted'` → `'suspended'`),
  the host auto-resumes after a 200 ms beat — the same idiom used for
  visibility-driven suspends.
- Once the context returns to `'running'`, the engine state goes back to
  `'live'`.

**Breaking:** `EngineState` adds an `'interrupted'` arm. Code doing exhaustive
`switch` on engine state needs an additional case (TypeScript will surface
this).
