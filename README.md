<div align="center">

# @schmooky/zvuk

**Audio engine for the web.** Wwise-grade routing, sprites, sidechain ducking, snapshots and music stems, in a tiny type-safe ESM package.

[![npm version](https://img.shields.io/npm/v/@schmooky/zvuk?style=flat-square&color=7c5cff)](https://www.npmjs.com/package/@schmooky/zvuk)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@schmooky/zvuk?style=flat-square&label=min%2Bgzip&color=7c5cff)](https://bundlephobia.com/package/@schmooky/zvuk)
[![types](https://img.shields.io/npm/types/@schmooky/zvuk?style=flat-square&color=7c5cff)](https://www.npmjs.com/package/@schmooky/zvuk)
[![license](https://img.shields.io/npm/l/@schmooky/zvuk?style=flat-square&color=7c5cff)](./LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/schmooky/zvuk/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/schmooky/zvuk/actions/workflows/ci.yml)

[**Docs**](https://zvuk.schmooky.dev/docs/) · [**Quickstart**](https://zvuk.schmooky.dev/docs/quickstart/) · [**Concepts**](https://zvuk.schmooky.dev/concepts/) · [**FX**](https://zvuk.schmooky.dev/fx/) · [**API**](https://zvuk.schmooky.dev/api/) · [**llms.txt**](https://zvuk.schmooky.dev/llms.txt)

</div>

---

## Install

```bash
pnpm add @schmooky/zvuk      # or npm i / yarn add / bun add
```

```ts
import { createEngine } from '@schmooky/zvuk';

const engine = createEngine({
  buses: {
    music: { level: 0.8 },
    sfx:   { level: 1.0 },
  },
  master: { headroom: -3, limiter: { threshold: -1 } },
});

await engine.unlock();                                   // call from a user gesture
await engine.loadSound('coin', ['/sfx/coin.webm', '/sfx/coin.m4a'], { bus: 'sfx' });

const v = engine.sound('coin').play({ volume: { jitter: 0.05 } });
await v.fade({ to: 0, duration: 0.8 });

engine.bus('music').fadeTo(0.1, 0.8);
```

> Every time-valued option in zvuk is in **seconds**, matching the Web Audio API.

## Why zvuk?

`HTMLAudioElement` doesn't survive past one menu blip. The Web Audio API does, and then you write your own bus graph, your own scheduler, your own iOS unlock dance, your own codec ladder, your own sidechain envelope and your own snapshot crossfader. That happens on every project I've shipped sound for, from scratch each time.

zvuk is that layer, done once. It gives you the routing primitives a game-audio team already reaches for in Wwise, FMOD or RAD, without the 60 MB editor, behind an API small enough to keep in your head.

- **Tiny and honest.** 17 kB min+gzip for the whole library, zero runtime dependencies, fully tree-shakable. CI fails the build above 18 kB.
- **ESM-only and TypeScript-strict.** Typed sound names, typed bus names, no `any` at the edges.
- **No magic.** The `AudioContext` is lazy, so importing the package does nothing. Lifecycle is explicit, and the real Web Audio nodes are reachable when you need them.
- **Built for slot and casino audio**, useful anywhere sound matters.

## Features

| Mix & routing | FX & processing | Loading & sources | Developer experience |
| --- | --- | --- | --- |
| Named buses with FX inserts | Compressor (`DynamicsCompressor` + makeup) | Codec ladder, `['x.webm', 'x.m4a']` | Lazy `AudioContext`, no constructor side effects |
| Master headroom + soft limiter | Filter, `BiquadFilter`, all 6 modes | Audio sprites, one buffer, N regions | iOS Safari unlock + visibility resume |
| Voice concurrency + stealing | Reverb, convolution + synthetic IR | Variants, `random` / `no-repeat` / `shuffle-bag` | Audio-clock scheduler (`scheduleAt`) |
| Sidechain ducking (`Ducker`) | Pitch-preserving time-stretch + realtime varispeed | Music stems: intro, loop, outro + `skipToOutro` | Async `cues` async-iterator on every `Voice` |
| Snapshots, capture & crossfade the mix | Spatializer, 2D pan + 3D HRTF | Stream long media via `MediaElementSource` | `AbortSignal` cancellation everywhere |
| Aux sends + bus groups | Bring-your-own `FxInsert` contract | Batch `preload` with progress + loudness normalize | "Did you mean…?" hints on bus/sound typos |
| Parameter macros, bind any value to a 0..1 control | | | Zero deps, provenance-signed npm releases |

## Examples

### Variants: kill the machine-gun repeat

```ts
await engine.loadVariants('footstep', [
  ['/sfx/step-1.webm', '/sfx/step-1.m4a'],
  ['/sfx/step-2.webm', '/sfx/step-2.m4a'],
  ['/sfx/step-3.webm', '/sfx/step-3.m4a'],
], { strategy: 'shuffle-bag', bus: 'sfx' });

// Every trigger fires a different take, the classic slot coin/win pattern.
engine.variants('footstep').play({ volume: { jitter: 0.04 } });
```

### Music stems: intro, loop, outro

```ts
const theme = await engine.loadMusic('level-1', {
  intro: ['/music/intro.webm', '/music/intro.m4a'],
  loop:  ['/music/loop.webm',  '/music/loop.m4a'],
  outro: ['/music/outro.webm', '/music/outro.m4a'],
}, { bus: 'music', loopCrossfade: 0.1 });

theme.play({ fadeIn: 1.2 });            // intro plays, then loops forever
theme.skipToOutro({ at: 'loop-end' });  // on win/level-end: finish the bar, then resolve

// Need two flat tracks instead? engine.crossfade('a', 'b', { duration: 1.5 }).
```

### Audio sprites: one buffer, many regions

```ts
await engine.loadSprite('cascade', '/sfx/cascade.webm', {
  small:  { start: 0,    duration: 0.2 },
  medium: { start: 0.25, duration: 0.4 },
  big:    { start: 0.7,  duration: 0.6 },
}, { bus: 'sfx' });

engine.sprite('cascade').play('medium', { volume: { jitter: 0.05 } });
```

### Sidechain ducking: music breathes under dialogue

```ts
import { Ducker } from '@schmooky/zvuk';

// Keyed from the `voice` bus; added to (and therefore ducks) the `music` bus.
const ducker = new Ducker(engine.context, engine.bus('voice'), {
  amount: 0.7, attack: 0.08, release: 0.6,
});
engine.bus('music').addFx(ducker);
```

### Parameter macros: one knob, many targets

```ts
const intensity = engine.parameter('intensity', 0);

intensity.bindTo((v) => { engine.bus('music').level = v; }, { from: 0.4, to: 1 });
intensity.bindTo((v) => { engine.bus('drone').level = v; }, { from: 0,   to: 0.6 });

intensity.set(0.85);   // both buses ramp, eased; .subscribe() to drive anything else
```

### Live spatial audio: hold the Voice, steer it per frame

```ts
const v = engine.sound('engine-loop').play({
  loop: true,
  spatializer: { position: [0, 0, 0] },
});

requestAnimationFrame(function tick() {
  v.spatializer?.setPosition(player.x, 0, player.z);
  requestAnimationFrame(tick);
});
```

### Snapshots: capture the mix, crossfade back to it

```ts
const calm = engine.captureSnapshot('calm');

engine.bus('music').fadeTo(0.2, 0.2);
engine.bus('voice').fadeTo(1.5, 0.2);

await calm.apply({ fade: 0.6 });   // restore the whole mix in one call
```

> More copy-paste recipes live in the [**docs**](https://zvuk.schmooky.dev/recipes/).

## Browser support

| Browser              | Minimum | Notes |
| -------------------- | ------- | ----- |
| Chrome, Edge, Opera  | 76+     | Opus + AAC, AudioWorklet, HRTF Spatializer |
| Firefox              | 88+     | Opus + AAC |
| Safari macOS         | 14.1+   | Opus from 14.5; `pickSource` falls back to AAC on older |
| Safari iOS           | 14.5+   | Same. Ship a `webm` + `m4a` pair via the codec ladder |

zvuk is ESM-only and assumes a working `AudioContext`. No polyfills, no IE shims.

## Documentation

The full site lives at **[zvuk.schmooky.dev](https://zvuk.schmooky.dev)**:

- **[Quickstart](https://zvuk.schmooky.dev/docs/quickstart/)** gets sound playing in about 30 lines.
- **[Concepts](https://zvuk.schmooky.dev/concepts/)** covers Engine, Bus, Sound, Voice, Snapshot, Spatializer, Concurrency and Parameter.
- **[FX](https://zvuk.schmooky.dev/fx/)** covers Compressor, Filter, Reverb, pitch and time-stretch, and Ducker.
- **[Guides](https://zvuk.schmooky.dev/guides/)** covers asset formats, loading, building your mix, ducking, and migrating from Howler.
- **[API reference](https://zvuk.schmooky.dev/api/)** is auto-generated TypeDoc, regenerated each build.
- **[llms.txt](https://zvuk.schmooky.dev/llms.txt)** and **[llms-full.txt](https://zvuk.schmooky.dev/llms-full.txt)** are the machine-readable index and the whole corpus.

Every Concept page embeds a live React island running the actual engine. Three buses, six samples, a voice counter that moves.

## CLI

```bash
npx @schmooky/zvuk transcode raw/*.wav   # ffmpeg ladder → webm/opus + m4a/aac
npx @schmooky/zvuk gen bank.json         # typed sound-name module from a manifest
```

## Contributing

```bash
pnpm install
pnpm test            # vitest, happy-dom + Web Audio mock
pnpm typecheck       # tsc --noEmit across src/ and test/
pnpm lint            # biome check
pnpm build           # tsup → dist/index.js + dist/cli.js + dist/index.d.ts
pnpm docs:dev        # astro dev at http://localhost:4321
pnpm bench           # vitest bench/
```

```
zvuk/
├── src/          package source
├── test/         vitest suite
├── bench/        vitest benchmarks
├── examples/     vanilla deployable demos (slot-machine, match-3, fps-footsteps)
├── docs/         Astro site → zvuk.schmooky.dev
└── tsup.config.ts
```

The package's `exports` resolve to `src/index.ts` for workspace consumers; `publishConfig` swaps it to `dist/…` at publish time so npm consumers get the compiled artifact.

### Release flow

Releases run on [Changesets](https://github.com/changesets/changesets):

1. Run `pnpm changeset` and describe your change.
2. Open a PR; CI gates on lint + typecheck + tests + lib build + docs build.
3. On merge to `main`, the workflow opens/updates a **Version Packages** PR that bumps the version and regenerates `CHANGELOG.md`.
4. Merging it publishes to npm **with provenance** via **OIDC trusted publishing** (no `NPM_TOKEN`), and cuts a GitHub Release.

Pushing any non-`main` branch, or running `release.yml` via `workflow_dispatch`, snapshot-publishes the pending changesets under a branch dist-tag. Install one with `pnpm add @schmooky/zvuk@<branch>`.

## Credits

Demo audio under [`docs/public/audio/`](docs/public/audio/) includes selections from [Kenney's Digital Audio pack](https://kenney.nl/assets/digital-audio) ([CC0](https://creativecommons.org/publicdomain/zero/1.0/), used unmodified; license preserved at [`KENNEY-LICENSE.txt`](docs/public/audio/KENNEY-LICENSE.txt)). All other audio is original to this project.

## License

[MIT](./LICENSE) © schmooky
