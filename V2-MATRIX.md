# zvuk v2 work matrix

Branch `feat/v2`. One row per item. Status: `todo`, `wip`, `done`, `dropped`.
"Breaking" marks a change a v1 caller can notice: a removed name, a changed signature or a changed behaviour.

## Library bugs

| ID | Item | Fix | Breaking | Test | Status |
|---|---|---|---|---|---|
| B1 | `BusConfig.sidechain` is declared but nothing reads it | Wire it: the engine builds a `Ducker` on the target bus, keyed on the `from` bus, when the graph is built | No (it starts working) | `sidechain-config.test.ts` | done |
| B2 | Loading a name twice leaks the old sprite, music, variants or stream | A reload disposes what it replaces: a stream is disposed, music instances stop, sprite and variant parts leave the registry | Behaviour | `reload-replaces.test.ts` | done |
| B3 | Loop crossfade leaves gaps when pitch is not 1 | Segment length, envelope and arm timer run in output seconds (`len / rate`); a rate change re-arms the chain | No | `loop-crossfade-rate.test.ts` + conformance | done |
| B4 | `steal: 'none'` still starts the rejected voice and emits `started` | Concurrency is decided before a source starts; a rejected voice never starts, has `rejected === true` and only emits `ended` | Behaviour | `steal-reject.test.ts` + conformance | done |
| B5 | `'lowest-priority'` ignores the new voice's priority | The new voice is a candidate too; when it ranks lowest it is rejected | Behaviour | `steal-priority.test.ts` | done |
| B6 | `no-repeat` never picks variant 0 first; one-variant bundles never set `lastPick` | Skip only when a previous pick exists; one-variant path records the pick | No | `variants-pick.test.ts` | done |
| B7 | Pause/resume on a looping region wraps by the buffer length | Offset wraps inside `[loopStart, loopEnd)` | No | `pause-loop-region.test.ts` | done |
| B8 | Abort a load and reload the same URL at once: the reload joins the doomed fetch | The in-flight entry leaves the map the moment its last waiter aborts | No | `decode-abort-reload.test.ts` | done |
| B9 | `removeFx` never disconnects the removed insert's output | Rewire disconnects every insert that was in the chain, removed ones included | No | `fx-remove.test.ts` | done |
| B10 | The `signal` abort listener outlives the voice | Listener removed in `finish()` | No | `voice-signal-leak.test.ts` | done |
| B11 | Tab return resumes a context the game suspended on purpose | `engine.suspend()` / `engine.resume()`; a user suspend is sticky and auto-resume leaves it alone | No | `user-suspend.test.ts` | done |
| B12 | `voice.fade()` after `stop()` overrides the stop ramp | `fade()` is a no-op while stopping | No | `voice-fade-after-stop.test.ts` | done |
| B13 | `combineSignals` leaves listeners on the batch signal when nothing aborts | Preload removes them when the item settles | No | `preload.test.ts` | done |
| B14 | Missing sprite region error says "Call engine.loadSound()" and regions are never validated | Own message; `loadSprite` validates region bounds against the buffer | Behaviour (bad regions now throw) | `sprite.test.ts` | done |

## API gaps

| ID | Item | Fix | Breaking | Test | Status |
|---|---|---|---|---|---|
| A1 | `Master` is exported but unreachable; no master volume or mute | `engine.master` with `volume`, `muted`, `fadeTo`, `headroom`, `setLimiter`, `reduction`, `meter()`; `masterMeter()` stays as a deprecated alias | No | `master-api.test.ts` | done |
| A2 | `MusicVoice` docs promise pause and resume that don't exist | `pause()`, `resume()`, `isPaused`, resuming at the right part and offset, pending outro kept | No | `music-pause.test.ts` | done |
| A3 | `CacheConfig` and `VoiceCue` aren't exported | Exported | No | type test | done |
| A4 | Byte-level download progress is unreachable | `LoadSoundOptions.onProgress(loaded, total)`; `PreloadOptions.onBytes` | No | `load-progress.test.ts` | done |
| A5 | Sprites, music, variants and streams can't be unloaded | `engine.unload(name, { evictBuffer })` covers every kind; kind-specific `has*` stay | No | `unload.test.ts` | done |
| A6 | The asset resolver sees internal names like `__sprite:x` | `ResolveAssetContext` gets the public `name`, plus `kind` and `part` | **Yes** | `resolve-asset.test.ts` | done |
| A7 | No listener API; pan and position jump instantly | `engine.listener` (position, orientation); `setPan`/`setPosition`/`setOcclusion` glide; `panningModel` option | No | `spatial.test.ts` | done |
| A8 | Reverb and filter changes and FX bypass click | Short `setTargetAtTime` ramps; bypass crossfades dry and processed paths | No | `fx-ramps.test.ts` | done |
| A9 | Stream: autoplay rejection swallowed, no `ended`, no fallback URL | `play()` resolves `false` when blocked, `ended` promise per play, next URL on media error | **Yes** (`play()` returns `boolean`) | `stream.test.ts` | done |
| A10 | `preload()` only takes plain sounds | Preload items take `kind: 'sprite' \| 'variants' \| 'music'` | No | `preload.test.ts` | done |

## Features

| ID | Item | Design | Breaking | Test | Status |
|---|---|---|---|---|---|
| F1 | Per-sound concurrency limit and retrigger cooldown | `limit: { max, steal, cooldown }` on `loadSound` / `loadVariants` / `loadSprite` options and `sound.setLimit()`; variants share one limit | No | `sound-limit.test.ts` | done |
| F2 | Weighted variants | `loadVariants(..., { weights })`, used by `random`, `no-repeat` and `shuffle-bag` | No | `variants-weights.test.ts` | done |
| F3 | Parameter glides | `param.rampTo(v, seconds, curve)` returns a promise; `set()` cancels a glide | No | `parameter.test.ts` | done |
| F4 | Snapshots capture sends, FX bypass and solo | `SnapshotState.sends`, `.fx`, `.solo` (all optional); `apply` fades sends | No | `snapshot-extended.test.ts` | done |

## v2 extras

| ID | Item | Design | Breaking | Test | Status |
|---|---|---|---|---|---|
| X1 | Scheduled starts | `PlayOptions.at` (audio time) on sounds, sprites, variants and music | No | `play-at.test.ts` + conformance | done |
| X2 | Musical grid | `loadMusic(..., { bpm, beatsPerBar })`; `musicVoice.nextBeat()`, `nextBar()`, `onBeat(fn)`; `skipToOutro({ at: 'bar' \| 'beat' })` | No | `music-grid.test.ts` | done |
| X3 | Voice-driven ducking | `play({ duck: { bus, amount, attack, release } })` ducks a bus for the life of the voice; the attack is stamped at the voice's start time, the release starts when it ends; overlapping ducks take the deepest | No | `voice-duck.test.ts` + conformance | done |

## Tooling

| ID | Item | Fix | Status |
|---|---|---|---|
| T1 | Conformance skips Firefox and has 3 specs | Firefox added to CI and release; `conformance/v2.test.ts` covers steal rejection, crossfade at pitch 2, scheduled start and voice ducking. Not run locally: the pinned Playwright needs browser build 1234, which isn't installed here | done (CI-verified only) |
| T2 | Release skips size-limit, conformance and a package check | `check:package` (publint + are-the-types-wrong) and size in CI and release verify | done |
| T3 | The tarball ships a 306 KB source map and an empty `cli.d.ts` | Maps out of `files`; dts only for the library entry; `"./package.json"` export; `bin` outside `publishConfig` too | done |
| T4 | CLI: no tests, no `--version`, bad `--formats` silently does nothing, same basename overwrites | Tests; `--version`; error on no valid format; mirrored folder layout under `--out` | done |
| T5 | `stretch.ts` has 5% coverage | Unit tests for `StretchProcessor` | done |
| T6 | Size budget | 17.05 kB to 22.49 kB gzipped for the full import; limits now 24 kB / 22 kB | done |

## Docs

| ID | Item | Status |
|---|---|---|
| D1 | Pitch demo fetches a deleted file | done |
| D2 | README calls `skipToOutro()` on `Music` | done |
| D3 | No search on phones; sidebar before content on mobile | done |
| D4 | Missing pages: CLI, Ducker FX, errors, loudness/codec helpers, Master | done |
| D5 | No version markers | done |
| D6 | No prev/next, edit link, skip link; changelog only in footer | done |
| D7 | Search indexes nav and footer | done |
| D8 | Old `theme-color`, incomplete OG/Twitter tags | done |
| D9 | TypeDoc doesn't support TS 5.9 | done |
| D10 | Few standalone examples | done |
| D11 | Restyle to match pixi-marrow and pixi-reels | done |
| D12 | v2 pages: migration guide, new APIs | done |

## Versioning

| ID | Item | Status |
|---|---|---|
| V1 | Changesets: one `major` entry listing the breaking changes, plus minor/patch entries per area | done |
| V2 | Pre-release mode `next`, so `main` publishes `2.0.0-next.N` under the `next` dist-tag until `changeset pre exit` | done |
| V3 | `MIGRATION.md` (v1 to v2) | done |
