---
'@schmooky/zvuk': patch
---

Fall through to the next URL on fetch / decode failure when loading an audio asset with a fallback list (codec ladder).

`engine.loadSound('coin', ['coin.webm', 'coin.m4a'])` previously selected one URL upfront via `pickSource()` and threw `DecodeError` immediately if that single URL 404'd, hit a network error, or failed to decode — even if the other URL would have worked. The codec ladder only protected against codec capability, not transport failures, so a stale CDN entry or under-reported `canPlayType` could brick a sound that had a perfectly good fallback sitting next to it in the array.

`Decoder` now exposes `loadFirst(urls, opts)` which walks the list in order (codecs the browser claims it can play float to the front via the new `pickSourceOrder()`), and falls through on per-URL fetch/decode failures. The first URL that successfully fetches AND decodes wins. `AbortError` from `opts.signal` is fatal and propagates verbatim — once the caller pulled the plug we don't keep trying. A cache fast-path scans every URL in the list before any fetch, so a previously-resolved fallback short-circuits without re-hitting the network.

When every URL fails, a new `AggregateDecodeError` is thrown with per-URL causes attached on `attempts`. It's a subclass of `DecodeError`, so existing `catch (e instanceof DecodeError)` paths still fire. Single-URL failures rethrow the underlying `DecodeError` verbatim — no behavioural change for callers that don't pass an array.
