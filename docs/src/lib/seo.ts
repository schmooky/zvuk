// Read npm package name + version straight from the published manifest so
// the navbar badge and footer link can never drift out of sync with what
// changesets actually publishes.
import pkg from '../../../package.json';

export const SITE = {
  name: 'zvuk',
  tagline: 'Audio Engine for the Web',
  description:
    'zvuk — a Wwise-grade audio engine for the web: lazy AudioContext, mixer buses, sidechain ducking, snapshots, sprites, and codec-aware loading. Tiny, ESM-only, type-safe.',
  url: 'https://zvuk.schmooky.dev',
  github: 'https://github.com/schmooky/zvuk',
  /** npm package name (`@schmooky/zvuk`). */
  npmName: pkg.name,
  /** Current package version, populated by `changeset version`. */
  version: pkg.version,
  /** Permalink to the package page on npmjs. */
  npm: `https://www.npmjs.com/package/${pkg.name}`,
};
