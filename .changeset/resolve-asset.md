---
'@schmooky/zvuk': minor
---

Add `createEngine({ resolveAsset })` — a generic hook for adopting buffers from an external asset system (Pixi `Assets.cache`, IndexedDB, manifest, custom loader) instead of (or alongside) zvuk's URL fetcher. Plus a "Asset resolution" guide with full recipes.

### Why

Most apps already have an asset system. Forcing zvuk to also fetch and decode the same audio file means double the download, double the RAM, and weird race conditions on the loading screen. The new resolver hook lets you point zvuk at whatever you already use, without zvuk depending on any of it.

### Shape

```ts
import { createEngine, type AssetResolver } from '@schmooky/zvuk';

const resolveAsset: AssetResolver = ({ name, url, signal }) => {
  // Return one of:
  //   AudioBuffer    — used as-is, no decode
  //   ArrayBuffer    — decoded via the engine's AudioContext
  //   string         — treated as a URL, fetched + decoded normally
  //   undefined/null — explicit miss; falls through to the URL list
};

const engine = createEngine({ buses: { sfx: {} }, resolveAsset });
```

The resolver runs before any fetch on every `loadSound` / `loadSprite` call. Returning `undefined`/`null` falls through to the URL list passed to `loadSound`, so resolvers can mix cached and uncached sounds without branching at the call site.

### Recipes covered in the guide

- **Pixi v8 + assetpack** — pull buffers straight out of `Assets.cache`, so the existing Pixi loading-screen progress bar drives audio downloads too. (A real example app will ship separately with slotplate.)
- **IndexedDB persistent cache** — fetch the first time, hydrate from the DB on returning users. Useful for slot machines and kiosk apps that load the same audio set repeatedly.
- **In-memory `Map` cache** — full control over eviction, useful for service-worker / build-time-inlined buffers.
- **Manifest-driven URLs** — ship one JSON mapping logical names to hash-busted URLs.

### Scope

Applies to `loadSound` and (transitively) `loadSprite`. `loadStream` is HTMLAudioElement-backed and doesn't decode buffers, so it stays on direct URL consumption — covered by a pitfall callout in the guide.
