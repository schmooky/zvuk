# Contributing to zvuk

The roadmap invites pull requests, so here is what to expect when you send
one.

## Getting set up

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Node 20 or newer, pnpm 10. The library has no runtime dependencies and the
build is `tsup`.

## The gates

Every one of these has to pass before a change lands. CI runs all of them.

| Command | What it covers |
| --- | --- |
| `pnpm lint` | Biome, over `src`, `test` and `conformance`. |
| `pnpm typecheck` | `tsc --noEmit`, strict, with `noUncheckedIndexedAccess`. |
| `pnpm test` | The fast suite: happy-dom plus a Web Audio fake. |
| `pnpm test:coverage` | Same suite with thresholds (80/80/80/70). |
| `pnpm test:conformance` | Chromium and WebKit, against a real `OfflineAudioContext`. |
| `pnpm bench` | Benchmarks, so a regression shows up as a number. |
| `pnpm build` | `tsup`, minified, with declaration output. |
| `pnpm size` | 18 kB gzipped ceiling on the published bundle. |
| `pnpm docs:build` | Astro, plus the OG-card and prose-lint assertions. |

## Which suite does your change belong in

The fast suite runs against a hand-written Web Audio fake. It is good at
wiring and lifecycle, and structurally unable to catch a scheduling bug: for
a long time `cancelScheduledValues` in that fake was an empty function.

So: if your change is about **what connects to what**, or **when an object is
disposed**, write a `test/` spec. If it is about **what comes out of the
speakers** — a ramp shape, a click, a limiter, a meter reading — write a
`conformance/` spec that renders audio and asserts on the samples.

Bug fixes need a regression test that fails on `main`. Say so in the PR, and
say how you checked.

## Changesets

Any change under `src/` needs a changeset:

```bash
pnpm changeset
```

Patch for fixes, minor for additive API. Docs-only commits must **not** carry
one — a push to a non-`main` branch with a pending changeset publishes an npm
snapshot.

## Writing

Docs prose has its own rules and its own linter. Read
[docs/STYLE.md](docs/STYLE.md) before editing a page under `docs/src/pages/`.
The short version: one em-dash per page, replace assertions with the evidence
behind them, and open a concept page with the problem rather than a
definition.

Source comments are held to the same bar, and they're the best-written prose
in the repo. Keep it that way.

## Commits

Conventional commits, one concern each. `fix:`, `feat:`, `docs:`, `test:`,
`chore:`, `perf:`. The body should say what was wrong, not only what changed.
