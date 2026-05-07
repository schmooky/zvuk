---
"@schmooky/zvuk": minor
---

Add the `Music` source — stinger → loop → outro, the pattern every casino slot, action game, and rhythm game uses for combat/win/menu music.

```ts
await engine.loadMusic('boss-theme', {
  intro: ['/music/boss-intro.webm', '/music/boss-intro.m4a'],
  loop:  ['/music/boss-loop.webm',  '/music/boss-loop.m4a'],
  outro: ['/music/boss-outro.webm', '/music/boss-outro.m4a'],
}, { bus: 'music', loopCrossfade: 0.05 });

const m = engine.music('boss-theme').play({ volume: 0.7, fadeIn: 0.2 });
// → intro plays once, then the loop runs forever.

m.skipToOutro();          // → finishes current loop iteration, plays outro, ends
m.skipToOutro({ at: 'now' }); // → fades loop (~50 ms), starts outro immediately
m.stop();                 // → click-free fade-out, no outro

await m.ended;
```

Each part accepts a single URL or a codec ladder, loaded through the same decoder cache and `resolveAsset` hook as `loadSound`. The intro and outro are both optional — a loop-only manifest works the way a regular looping sound does today, and `skipToOutro()` on a loop-only asset falls through to a clean stop so calling code doesn't have to branch on `music.hasOutro`.

`loopCrossfade` carries through to the loop body (same equal-power-at-the-boundary trick from v1.5's `PlayOptions.loopCrossfade`), so non-zero-crossing loop regions don't click on takeover.

A new vanilla example `examples/music-stinger-loop-tail/` wires it up end-to-end with start/skip-to-outro · loop-end/skip-to-outro · now/hard-stop buttons and a part-state indicator. The Music concept page on the docs site walks through the API surface and the two skip-to-outro modes.

Drive-by: deleted three pre-existing lint warnings (`_baseLevel` unused field on Bus, template-literal nit in CLI transcode, optional-chain nit in codecs).
