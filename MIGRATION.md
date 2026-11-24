# Migrating from zvuk 1.x to 2.0

Most apps upgrade without code changes. Read the list below. If none of the items applies to your code, the upgrade is a version bump.

```bash
pnpm add @schmooky/zvuk@next   # 2.0 pre-releases
```

## Breaking changes

### 1. The asset resolver gets the public name

In 1.x, `resolveAsset` saw internal keys for anything that wasn't a plain sound: `__sprite:ui`, `__variant:coin:2`, `__music:theme:loop`. A resolver that looked names up in a manifest missed all of them. 2.0 passes the name you loaded the asset under, and says what is being loaded:

```ts
createEngine({
  resolveAsset: ({ name, kind, part, url }) => {
    // kind: 'sound' | 'sprite' | 'variants' | 'music'
    // part: variant index, or 'intro' | 'loop' | 'outro' for music
    return manifest[kind === 'music' ? `${name}:${part}` : name];
  },
});
```

**Action:** if your resolver parsed `__sprite:` / `__variant:` / `__music:` prefixes, switch to `kind` and `part`.

### 2. `StreamSound.play()` resolves a boolean

It resolves `true` once playing, and `false` when the browser refused (autoplay policy before a user gesture, or no playable source). In 1.x it resolved `void` either way.

**Action:** none, unless you typed the result as `Promise<void>`. Use the boolean to retry from a gesture:

```ts
if (!(await engine.stream('bgm').play({ loop: true }))) showTapToStart();
```

Streams also take a URL ladder now, `loadStream('bgm', ['bgm.webm', 'bgm.m4a'])`. On a media error they fall back to the next URL, and `stream.ended` resolves when playback ends.

### 3. A voice a limit rejects never starts

With `steal: 'none'`, or any other strategy that rejects, 1.x started the new voice, emitted `'started'`, and then stopped it over the 8 ms stop fade. In 2.0 the limit is checked before anything starts. The rejected voice:

- has `voice.rejected === true` and `voice.isDone === true`
- emits only `'ended'` on `cues()`
- already has `ended` resolved
- makes no sound and is not counted on its bus

**Action:** if you counted `'started'` cues to detect plays, check `voice.rejected` instead.

### 4. `'lowest-priority'` can reject the newcomer

1.x always stole the lowest-priority playing voice, so a priority-0 coin could cut off a priority-10 jackpot. In 2.0 the new voice is rejected when its priority is lower than every playing voice's. Ties still go to the new voice.

**Action:** none, unless you relied on low-priority sounds always getting through.

### 5. Sprite regions are validated

`loadSprite` throws a `RangeError` when a region doesn't fit the decoded buffer: a negative start, a zero or negative duration, or an end more than 50 ms past the end of the buffer. 1.x played silence or a cut tail without saying why.

A missing region now throws `SpriteRegionNotFoundError`, which lists the regions the sprite has. It used to throw `SoundNotFoundError`, with advice to call `loadSound`. Both classes extend `ZvukError`.

**Action:** fix any sprite maps that now throw. If you caught `SoundNotFoundError` from `sprite.play()`, catch `SpriteRegionNotFoundError` or `ZvukError`.

### 6. Reloading a name replaces the old asset

Calling `loadStream`, `loadMusic`, `loadSprite` or `loadVariants` again with a name already in use:

- **streams:** disposes the old stream, so its `<audio>` element stops
- **music:** stops the old asset's live instances
- **sprites and variants:** replaces the registry entry; voices already playing finish

In 1.x the old asset stayed connected, and its playing instances could no longer be reached to stop them.

### 7. `Bus.applyConcurrencyOnSpawn` is gone

It was engine-internal, though public. Its replacement, `bus.planConcurrency(candidate)`, is also internal: it decides and stops nothing.

### 8. `zvuk gen` output changed

- `loadBank(engine, options)` now loads through `engine.preload`, so it gets the concurrency cap, progress and `PreloadError`. `options` is a `PreloadOptions`.
- `loop` is data on each `BANK` entry. In 1.x it was passed to `loadSound`, which ignored it.
- An empty bank generates `SoundName = never` (1.x generated invalid TypeScript).
- Duplicate names and entries without a `url` are errors.

**Action:** re-run `zvuk gen`. If you passed `LoadSoundOptions` to `loadBank`, pass them per entry, or use `engine.preload` directly.

### 9. CLI is stricter

- `zvuk transcode --formats` with an unknown or empty list exits with an error. 1.x did nothing.
- Unknown options are errors.
- Inputs from several folders keep their layout under `--out`, so `sfx/hit.wav` and `ui/hit.wav` no longer overwrite each other. Inputs from a single folder are written flat, as before.

### 10. Packaging

- The tarball ships no source maps.
- `@schmooky/zvuk/package.json` is an export.

## Deprecated

- `engine.masterMeter()`: use `engine.master.meter()`. It still works in 2.0.

## Behaviour fixes you might notice

These fix 1.x bugs and need no action, but they can change what you hear:

- `BusConfig.sidechain` now ducks. In 1.x it was accepted and ignored. If you configured it and are happy with the mix as it is, remove it.
- Loop crossfade at pitch other than 1 no longer leaves a gap on every lap.
- Pause and resume on a looping sprite region resume inside the region.
- Coming back to the tab no longer resumes a context the app suspended on purpose. Use `engine.suspend()` and `engine.resume()` for that.
- Filter and reverb parameter changes glide over about 10 ms, and filter and compressor bypass crossfades, so they no longer click.
- Spatializer `setPan` / `setPosition` / `setOcclusion` glide (time constant 0.02 s). Pass `glide: 0` in the spatializer options to get the 1.x jumps back.
- `voice.fade()` after `stop()` no longer overrides the stop ramp.
- `bus.removeFx()` disconnects the insert, so its tail stops and it can be added to another bus.
- `'no-repeat'` variants can pick the first take first; one-take bundles record `lastPick`.
- Aborting a load and reloading the same URL right away works.
- Preload no longer leaves listeners on a long-lived batch signal, and voices take their abort listener off `play({ signal })` when they end.
- Snapshots restore sends, FX bypass and solo when they were captured with them. With `apply({ fade })`, parameters glide too.

## New in 2.0

See the README's "New in v2" section and the docs. In short:

- `engine.master` with `volume`, `muted` and `fadeTo`
- `engine.listener`
- `engine.suspend()` / `engine.resume()`
- `engine.unload(name)` for any kind of asset
- `play({ at })` and `play({ duck })`
- per-sound `limit: { max, steal, cooldown }`
- weighted variants
- music `pause()` / `resume()` and the tempo grid (`bpm`, `nextBar()`, `onBeat()`, `skipToOutro({ at: 'bar' })`)
- `Parameter.rampTo()`
- byte-level `onProgress` / `onBytes`
- preload of sprites, variants and music
- `zvuk --version`
