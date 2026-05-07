---
"@schmooky/zvuk": minor
---

Routing primitives — bus sends, solo, bus groups, and a master meter.

```ts
// Send a configurable share of one bus into another.
const verbSend = engine.bus('music').send(engine.bus('reverb'), { amount: 0.3 });
verbSend.amount = 0.5;          // setter ramps over 10 ms
await verbSend.fadeTo(0, 1.2);  // smooth fade-out
verbSend.dispose();             // remove

// Solo any subset of buses; engine coordinates the global mute-the-rest rule.
engine.bus('voice').solo();
engine.bus('music').solo();     // additive — both still audible
engine.bus('voice').unsolo();   // music still soloed; everyone else still muted

// Address several buses with a single handle.
const combat = engine.busGroup('combat', [
  engine.bus('weapons'),
  engine.bus('enemies'),
  engine.bus('environment'),
]);
combat.level = 0.5;             // applied to every member
await combat.fadeTo(0, 0.8);    // fades every member in parallel
combat.solo();                  // solos every member at once

// Live amplitude readout on the master output — same shape as bus.meter().
const m = engine.masterMeter(); // → { rms, peak }
```

Four additions, all sharing the routing/mixing theme:

- **`bus.send(target, { amount, post })`** — the Wwise primitive the README has been claiming. Each `send` returns a `Send` handle with live `amount`, `fadeTo()`, and `dispose()`. Default tap is post-fader / post-FX; pass `post: false` for monitor-style pre-fader sends. Sends route into the target's `input`, so the target's FX chain and concurrency rules apply naturally.
- **`bus.solo()` + `bus.unsolo()`** — engine maintains the global solo set. While any bus is soloed, every non-soloed bus is muted via a 10 ms ramp; when the set drains, every bus is restored. Solo state is independent of `muted` — un-soloing returns each bus to its own user-visible mute state, not unconditionally to "audible". Multiple solos are additive.
- **`engine.busGroup(name, members)` / `engine.busGroup(name)`** — a `BusGroup` is a logical handle, not an audio node. Setting `group.level`, calling `group.fadeTo()`, `group.muted = true`, or `group.solo()` applies to every member in parallel. Doesn't change the audio graph; pure convenience for sub-mixes that always move together.
- **`engine.masterMeter()`** — same `{ rms, peak }` readout as `bus.meter()` and `voice.level()`, just at the top of the chain. Lazy AnalyserNode tap on `master.input`.

The Bus concept page on the docs site picks up four new sections covering each.
