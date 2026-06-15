<div align="center">

# @schmooky/zvuk

**Audio Engine for the Web** — Wwise-grade routing, audio sprites, sidechain ducking, snapshots, in a tiny ESM package.

[![npm version](https://img.shields.io/npm/v/@schmooky/zvuk?style=flat-square&color=4f6cf7)](https://www.npmjs.com/package/@schmooky/zvuk)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@schmooky/zvuk?style=flat-square&label=min%2Bgzip&color=4f6cf7)](https://bundlephobia.com/package/@schmooky/zvuk)
[![types](https://img.shields.io/npm/types/@schmooky/zvuk?style=flat-square&color=4f6cf7)](https://www.npmjs.com/package/@schmooky/zvuk)
[![license](https://img.shields.io/npm/l/@schmooky/zvuk?style=flat-square&color=4f6cf7)](./LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/schmooky/zvuk/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/schmooky/zvuk/actions/workflows/ci.yml)

[**Documentation**](https://zvuk.schmooky.dev/docs/) · [**Concepts**](https://zvuk.schmooky.dev/concepts/) · [**API**](https://zvuk.schmooky.dev/api/) · [**Roadmap**](https://zvuk.schmooky.dev/roadmap/) · [**llms.txt**](https://zvuk.schmooky.dev/llms.txt)

</div>

---

## Install

```bash
pnpm add @schmooky/zvuk
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

await engine.unlock();                                  // call from a user gesture
await engine.loadSound('coin', '/sfx/coin.webm', { bus: 'sfx' });

const v = engine.sound('coin').play({ volume: { jitter: 0.05 } });
await v.fade({ to: 0, duration: 0.8 });

engine.bus('music').fadeTo(0.1, 0.8);
```

> All time-valued options in zvuk are **seconds** (matching the Web Audio API).

## Why zvuk?

`HTMLAudioElement` doesn't scale past one menu sound. The Web Audio API does, but you end up writing your own bus graph, your own scheduler, your own iOS unlock dance, your own codec ladder, your own sidechain envelope, your own snapshot crossfader — every time.

zvuk is the layer above. It gives you the routing primitives a real game audio team uses (Wwise / FMOD / RAD) without a 60 MB editor, behind an API surface small enough to fit in your head. ESM-only, type-safe, zero runtime dependencies, ~16 KB min+gzip.

## Features

| Mixer | FX | Loading | DX |
| --- | --- | --- | --- |
| Named buses with FX inserts | Compressor (DynamicsCompressor + makeup) | Codec ladder (`['x.webm', 'x.m4a']`) | Lazy AudioContext (no constructor side-effects) |
| Master headroom + brick-wall limiter | Filter (BiquadFilter, all 6 modes) | Audio sprites (one buffer, N regions) | iOS Safari unlock + visibility resume |
| Voice concurrency + stealing | Reverb (convolution + synthetic IR) | Stream long media via MediaElementSource | Sample-accurate scheduler |
| Sidechain ducking (Ducker) | Time-stretch (offline SOLA + realtime Worklet) | Loudness normalization on load | Async cues iterator on every Voice |
| Snapshots — capture & crossfade the mix | Spatializer (2D pan + 3D HRTF) | AbortSignal cancellation | "Did you mean…" on bus/sound name typos |

## Examples

### Audio sprites — one buffer, many regions

```ts
await engine.loadSprite('cascade', '/sfx/cascade.webm', {
  small:  { start: 0,    duration: 0.2 },
  medium: { start: 0.25, duration: 0.4 },
  big:    { start: 0.7,  duration: 0.6 },
}, { bus: 'sfx' });

engine.sprite('cascade').play('medium', { volume: { jitter: 0.05 } });
```

### Stream long media (don't decode 4 minutes into RAM)

```ts
const intro = engine.loadStream('intro', '/music/intro.m4a', { bus: 'music' });
await intro.play({ loop: true, volume: 0.6 });
```

### Crossfade music tracks (equal-power)

```ts
await engine.loadSound('intro', '/music/intro.webm', { bus: 'music' });
await engine.loadSound('main',  '/music/main.webm',  { bus: 'music' });

engine.sound('intro').play({ loop: true });
engine.crossfade('intro', 'main', { duration: 1.5 });
```

### Sidechain ducking — music breathes under VO

```ts
import { Ducker } from '@schmooky/zvuk';

// The source bus (keyed from) is the 2nd argument; the target bus is
// whichever bus you add the ducker to.
const ducker = new Ducker(engine.context, engine.bus('voice'), {
  amount: 0.7, attack: 0.08, release: 0.6,
});
engine.bus('music').addFx(ducker);
```

### Live spatial audio — hold the Voice, steer it per-frame

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

### Snapshots — capture the mix, crossfade back to it

```ts
const calm = engine.captureSnapshot('calm');

engine.bus('music').fadeTo(0.2, 0.2);
engine.bus('voice').fadeTo(1.5, 0.2);

await calm.apply({ fade: 0.6 });   // restore everything in one call
```

## Browser support

| Browser              | Minimum | Notes |
| -------------------- | ------- | ----- |
| Chrome, Edge, Opera  | 76+     | Opus + AAC, AudioWorklet, HRTF Spatializer |
| Firefox              | 88+     | Opus + AAC |
| Safari macOS         | 14.1+   | Opus from 14.5; pickSource falls back to AAC on older |
| Safari iOS           | 14.5+   | Same — bundle a webm + m4a pair via the codec ladder |

zvuk is ESM-only and assumes a working `AudioContext`. No polyfills; no shims for IE.

## Documentation

- **[Quickstart](https://zvuk.schmooky.dev/docs/quickstart/)** — running in 30 lines
- **[Concepts](https://zvuk.schmooky.dev/concepts/)** — Engine, Bus, Sound, Voice, Snapshot, Spatializer, Concurrency
- **[FX](https://zvuk.schmooky.dev/fx/)** — Compressor, Filter, Reverb, Pitch & time-stretch, Ducker
- **[Guides](https://zvuk.schmooky.dev/guides/)** — asset formats, loading, mix building, ducking, migrating from Howler
- **[Recipes](https://zvuk.schmooky.dev/recipes/)** — short, copy-paste-ready solutions
- **[API reference](https://zvuk.schmooky.dev/api/)** — auto-generated TypeDoc, regenerated each build
- **[llms.txt](https://zvuk.schmooky.dev/llms.txt)** — agent-readable index of the entire site

## Working in this repo

```bash
pnpm install
pnpm test            # vitest, happy-dom + Web Audio mock
pnpm typecheck       # tsc --noEmit across src/ and test/
pnpm lint            # biome check
pnpm build           # tsup → dist/index.js + dist/cli.js + dist/index.d.ts
pnpm docs:dev        # astro dev at http://localhost:4321
pnpm docs:build      # astro + pagefind index + OG cards + llms.txt
pnpm bench           # vitest bench/
```

The package's `exports` field resolves to `src/index.ts` for workspace consumers. `publishConfig` overrides it to `dist/...` at publish time so npm consumers get the compiled artifact. Concept pages embed live React-island demos that drive the real engine — no mocks.

```
zvuk/
├── src/                package source
├── test/               vitest suite
├── bench/              vitest bench/
├── examples/           vanilla deployable demos (slot-machine, match-3, fps-footsteps)
├── docs/               Astro site → zvuk.schmooky.dev
└── tsup.config.ts      ESM build config
```

## Release flow

Releases are driven by [Changesets](https://github.com/changesets/changesets) on every push to `main`:

1. Add a changeset describing your change: `pnpm changeset`
2. Open a PR; CI gates on lint + typecheck + tests + lib build + docs build.
3. On merge to `main`, the release workflow opens (or updates) a `Version Packages` PR that bumps the version and regenerates `CHANGELOG.md`.
4. Merging that PR publishes to npm with provenance attestation and creates a GitHub Release.

For per-branch preview publishes on non-`main` branches, a snapshot workflow auto-publishes under a sanitized branch dist-tag — install with `pnpm add @schmooky/zvuk@<branch>`.

## CLI

```bash
npx @schmooky/zvuk transcode raw/*.wav   # ffmpeg ladder → webm/opus + m4a/aac
npx @schmooky/zvuk gen bank.json         # typed sound-name module from a manifest
```

## Credits

The demo audio shipped under [`docs/public/audio/`](docs/public/audio/) includes selections from [Kenney's Digital Audio pack](https://kenney.nl/assets/digital-audio), released under [CC0](https://creativecommons.org/publicdomain/zero/1.0/) and used here without modification. Kenney's full license file is preserved at [`docs/public/audio/KENNEY-LICENSE.txt`](docs/public/audio/KENNEY-LICENSE.txt). All other audio is original to this project.

## License

[MIT](./LICENSE) © schmooky
