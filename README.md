# zvuk

> Audio Engine for the Web. Wwise-grade routing, sprite loading, sidechain ducking — in a tiny ESM package.

```bash
pnpm add zvuk
```

```ts
import { createEngine } from 'zvuk';

const engine = createEngine({
  buses: {
    music: { level: 0.8 },
    sfx:   { level: 1.0 },
  },
  master: { headroom: -3 },
});

await engine.unlock();                 // call from a user gesture
await engine.loadSound('coin', '/sfx/coin.wav', { bus: 'sfx' });

const v = engine.sound('coin').play({ volume: { jitter: 0.05 } });
await v.fade({ to: 0, ms: 800 });

engine.bus('music').fadeTo(0.1, 800);
```

## What's in this repo

```
zvuk/
├── src/                 the zvuk package source
├── test/                vitest suite
├── docs/                Astro docs site (deploys to zvuk.dev)
└── tsup.config.ts       single-file ESM build
```

- The **root package** is `zvuk`. It's what npm publishes.
- The **docs** site lives in `docs/` and deploys independently. Concept pages embed live React-island demos that drive the real engine.

## Working in this repo

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
pnpm docs:dev
```

What each script does:

- `pnpm test` — Vitest, happy-dom + Web Audio mock.
- `pnpm typecheck` — `tsc --noEmit` across `src/` and `test/`.
- `pnpm build` — tsup bundles `dist/index.js` + `dist/index.d.ts`.
- `pnpm docs:dev` — Astro dev server at http://localhost:4321. Reads the
  package source directly via the `src/index.ts` exports — no prior `pnpm build` needed.

The package's `exports` field resolves to `src/index.ts` for workspace
consumers. `publishConfig` overrides it to `dist/...` at publish time so
npm consumers get the compiled artifact.

## Releasing

Releases are managed by [Changesets](https://github.com/changesets/changesets):

```bash
pnpm changeset              # describe your change (patch / minor / major)
git add .changeset/*.md && git commit -m "feat: describe it"
git push                    # PR + merge to main
```

## Credits

The demo audio shipped under [docs/public/audio/](docs/public/audio/) includes
selections from [Kenney's "Digital Audio" pack](https://kenney.nl/assets/digital-audio),
released under [CC0](https://creativecommons.org/publicdomain/zero/1.0/) — used here
without modification. Kenney's full license file is preserved alongside those assets in
[docs/public/audio/KENNEY-LICENSE.txt](docs/public/audio/KENNEY-LICENSE.txt). All other
audio in the repo is original to this project.

## License

MIT for source code. Demo audio attributions live above.
