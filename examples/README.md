# zvuk examples

Three deployable demos showing zvuk in real shapes — no React, no Vue, no
Svelte. Just `index.html` + a small TypeScript module per example. Each one
illustrates one cluster of the engine that's hard to explain in isolation.

| Example         | Concept it shows                                                  |
| --------------- | ----------------------------------------------------------------- |
| `slot-machine/` | Sprites for reel ticks, sidechain ducking music under big wins.    |
| `match-3/`      | Concurrency limits + voice stealing as cascades stack.             |
| `fps-footsteps/`| Spatializer (3D) live-tracked to a player position, jitter for variety. |

## Running

These are zero-build examples — they import the workspace `zvuk` package
straight from `src/index.ts`. Serve from the repo root with any static server:

```bash
npx serve .
# then open http://localhost:3000/examples/slot-machine/
```

## What you'll need

The HTML pages assume you supply your own `assets/` audio. The shape each
example expects is documented in its `index.html` (look for the `// ASSETS:`
comment at the top of the script tag).
