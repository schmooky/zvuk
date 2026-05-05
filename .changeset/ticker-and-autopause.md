---
'@schmooky/zvuk': minor
---

Add opt-in `tickSource` injection so the scheduler can dispatch JS callbacks from a host's existing render loop (Pixi `app.ticker`, GSAP `gsap.ticker`, custom rAF) instead of `setTimeout`. Also expose the existing visibility-driven AudioContext suspend as a configurable `autoPauseOnHidden` flag, and add a "Runtime timing" guide that documents the full timing model.

### Why

`engine.scheduleAt(audioTime, fn)` and voice region timers previously used `setTimeout` exclusively. Browsers throttle `setTimeout` to ~1 Hz on hidden tabs, so callbacks scheduled to fire while the tab is hidden land late. Audio playback itself is unaffected — Web Audio runs on its own thread and zvuk stamps fade ramps and source starts directly with audio time — but the JS-side confirmation callbacks lag.

Spinning up a parallel `requestAnimationFrame` loop inside the library would be the wrong fix: it doesn't help on hidden tabs (rAF pauses entirely there, worse than `setTimeout`'s 1 Hz throttle), and it burns frames in hosts that already have a render loop. Better to let consumers wire zvuk into the loop they already run.

### Ticker injection

```ts
import { Application } from 'pixi.js';
import { createEngine, type TickSource } from '@schmooky/zvuk';

const app = new Application();
await app.init({ /* ... */ });

const tickSource: TickSource = {
  subscribe(handler) {
    app.ticker.add(handler);
    return () => app.ticker.remove(handler);
  },
};

const engine = createEngine({ buses: { sfx: {} }, tickSource });
```

`TickSource` is a minimal `subscribe(handler) → unsubscribe` shape — anything you can `add(handler)` and later `remove(handler)` from is a valid source. The scheduler subscribes lazily (only while there are pending tasks) so a 60 Hz host loop isn't waking it 60 times a second to do nothing. Without a `tickSource`, the scheduler keeps using `setTimeout`.

### `autoPauseOnHidden`

The engine has always suspended the AudioContext on `visibilitychange === 'hidden'` and resumed on return — primarily as the iOS Safari reliability workaround for suspension-on-blur. That behaviour is now exposed as `createEngine({ autoPauseOnHidden: false })` for music players and background-audio apps that want playback to continue across tab switches. Default remains `true`, so existing code is unaffected.

### Docs

New `/guides/runtime-timing/` page covers the JS-vs-audio timing split, why we don't run an internal rAF, the Pixi / GSAP / custom-rAF recipes, and how to pick a strategy per use case.
