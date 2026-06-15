import { defineConfig } from 'vite';

/**
 * Dev server for the vanilla examples under `examples/`.
 *
 * Served from the repo root (Vite's default root = cwd) so that both the
 * examples' absolute `/docs/public/audio/...` asset paths and their
 * `../../src/index` workspace imports resolve, while Vite transpiles the
 * TypeScript on the fly. Static `npx serve .` can't do this — browsers can't
 * execute `.ts` modules.
 *
 * Run with `pnpm examples`, then open the example it launches (or any other,
 * e.g. http://localhost:5173/examples/match-3/).
 */
export default defineConfig({
  server: {
    open: '/examples/',
  },
});
