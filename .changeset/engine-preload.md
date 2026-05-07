---
"@schmooky/zvuk": minor
---

Add `engine.preload(items, options)` — a first-class bulk loader for loading screens.

```ts
await engine.preload(
  [
    { name: 'coin', url: ['/sfx/coin.webm', '/sfx/coin.m4a'], options: { bus: 'sfx' } },
    { name: 'win',  url: ['/sfx/win.webm',  '/sfx/win.m4a'],  options: { bus: 'sfx' } },
    // ... 100 more items
  ],
  {
    concurrency: 4,
    onProgress: ({ name, status, completed, total }) => {
      bar.value = completed / total;
    },
  },
);
```

The DIY `Promise.all(items.map(loadSound))` pattern works fine for small batches, but breaks down once you ship a real loading screen: every adopter writes the same boilerplate for per-item progress, a concurrency cap so the rest of the page's network isn't starved, and aggregated failure reporting. `engine.preload` provides all three:

- **Per-item progress** via `onProgress({ name, status, completed, total })`. `completed / total` is your loading-bar fraction.
- **Concurrency cap** (default `4`) — caps in-flight fetches so the browser's per-host connection budget (typically 6) isn't fully consumed by audio.
- **Aggregated failures** — the promise rejects with `PreloadError` only after every item has settled, exposing `.failures: { name, cause }[]`. A single broken asset doesn't short-circuit the rest of the screen.
- **Cancellable** via `options.signal` — pending items aren't started, in-flight fetches receive the abort.

Item shape mirrors `loadSound` one-for-one (`{ name, url, options? }`), so existing manifests can be passed through without massaging the data first.

Documented in the "Loading sounds" guide.
