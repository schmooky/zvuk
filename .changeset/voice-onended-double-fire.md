---
"@schmooky/zvuk": patch
---

Fix `Voice` invoking the engine's internal `onEnded` callback twice on natural
end of non-looped sources.

The voice constructor wired the engine cleanup hook both through
`bindSourceLifecycle` (sync, when `AudioBufferSourceNode.onended` fires) and
through `this.ended.then(...)` (microtask, when `finish()` resolves the
`ended` promise). `stop()`, abort signals, and the region timer all flowed
through only the promise path, so natural end was the lone asymmetric case.

Engine and Bus voice tracking use `Set.delete` so the duplicate was
idempotent in practice — but it was a real correctness bug waiting to bite
any callback that wasn't safe to call twice. All termination paths now fire
exactly once via the promise.
