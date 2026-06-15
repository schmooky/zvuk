# zvuk examples

Deployable demos showing zvuk in real shapes — no React, no Vue, no
Svelte. Just `index.html` + a small TypeScript module per example. Each one
illustrates one cluster of the engine that's hard to explain in isolation.

| Example              | Concept it shows                                                                |
| -------------------- | ------------------------------------------------------------------------------- |
| `slot-machine/`      | Streaming music, sidechain ducking under big wins, normalize on load.           |
| `match-3/`           | Concurrency limits + voice stealing as cascades stack.                          |
| `fps-footsteps/`     | Spatializer (3D) live-steered from pointer position via `voice.spatializer`.    |
| `rhythm-metronome/`  | `engine.scheduleAt` for tightly-scheduled clicks, plus live `bus.meter()` + `voice.level()` driving a VU meter and per-voice peak. |
| `music-stinger-loop-tail/` | `engine.loadMusic({ intro, loop, outro })` — stinger plays once, loop body runs forever, outro fires at the next loop boundary so the music ends musically. |
| `snapshot-blend/`    | `engine.captureSnapshot()` + `engine.blendSnapshots(a, b, t)` — a slider drives a Parameter that interpolates the live mix between a `calm` and `combat` shape. |

## Running

Each example is an `index.html` + a small TypeScript module that imports the
engine straight from the workspace source (`../../src/index`) and reads the
audio the docs site ships at `docs/public/audio/`. Because the modules are
TypeScript, they need transpiling — serve them with Vite from the repo root:

```bash
pnpm install      # once
pnpm examples     # opens http://localhost:5173/examples/
```

Vite transpiles the TypeScript on the fly and resolves both the
`../../src/index` import and the `/docs/public/audio/...` asset paths. (A
plain static server like `npx serve .` can't run these — browsers don't
execute `.ts` modules.)

## Swap the music bed

`slot-machine/`, `music-stinger-loop-tail/`, and `snapshot-blend/` use the
`music-a.mp3` / `music-b.mp3` beds that already ship under
`docs/public/audio/` — no setup needed. To use your own, drop a replacement
(MP3, or transcoded `.webm` / `.m4a`) at `docs/public/audio/music-a.mp3` and
the demos pick it up. Every other example runs off the SFX shipped in the
repo.

## Audio credits

The example SFX and music under `docs/public/audio/` are original to this
project, **except** `phaseJump1.ogg` (used by `rhythm-metronome/`), which is
from [Kenney's "Digital Audio" pack](https://kenney.nl/assets/digital-audio),
released under [CC0](https://creativecommons.org/publicdomain/zero/1.0/) — see
`docs/public/audio/KENNEY-LICENSE.txt`. (A few other unused Kenney clips —
`laser*.ogg`, `powerUp*.ogg`, `zap*.ogg` — also ship under that directory.)
