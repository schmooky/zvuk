export interface NavItem {
  href: string;
  label: string;
  /** Version the feature landed in, rendered as a small "Since" marker in the sidebar. */
  since?: string;
}
export interface NavSection {
  title: string;
  items: NavItem[];
}

/**
 * The docs sidebar, and the reading order for previous/next links.
 *
 * Every page under src/pages that a reader should be able to reach belongs
 * in exactly one section here. Adding a v2 page is one line: put it where it
 * reads best and the pager, the mobile section list and llms.txt follow.
 */
export const DOCS_NAV: NavSection[] = [
  {
    title: 'Start here',
    items: [
      { href: '/docs/', label: 'What is zvuk?' },
      { href: '/docs/quickstart/', label: 'Quickstart' },
      { href: '/docs/why/', label: 'Why another audio lib?' },
      { href: '/roadmap/', label: 'Roadmap' },
      { href: '/changelog/', label: 'Changelog' },
      { href: '/guides/migrating-to-v2/', label: 'Migrating to v2', since: '2.0' },
    ],
  },
  {
    title: 'Concepts',
    items: [
      { href: '/concepts/', label: 'Overview' },
      { href: '/concepts/engine/', label: 'Engine' },
      { href: '/concepts/master/', label: 'Master bus' },
      { href: '/concepts/mixer/', label: 'Mixer' },
      { href: '/concepts/bus/', label: 'Bus' },
      { href: '/concepts/sound/', label: 'Sound' },
      { href: '/concepts/music/', label: 'Music', since: '1.8' },
      { href: '/concepts/voice/', label: 'Voice' },
      { href: '/concepts/snapshot/', label: 'Snapshot' },
      { href: '/concepts/parameter/', label: 'Parameter' },
      { href: '/concepts/concurrency/', label: 'Concurrency' },
      { href: '/concepts/spatializer/', label: 'Spatializer' },
    ],
  },
  {
    title: 'FX',
    items: [
      { href: '/fx/', label: 'Overview' },
      { href: '/fx/compressor/', label: 'Compressor' },
      { href: '/fx/ducker/', label: 'Ducker' },
      { href: '/fx/filter/', label: 'Filter' },
      { href: '/fx/pitch/', label: 'Pitch & time-stretch' },
      { href: '/fx/reverb/', label: 'Reverb' },
    ],
  },
  {
    title: 'Guides',
    items: [
      { href: '/guides/', label: 'Overview' },
      { href: '/guides/asset-formats/', label: 'Asset formats (webm/m4a)' },
      { href: '/guides/loading/', label: 'Loading sounds' },
      { href: '/guides/asset-resolution/', label: 'Asset resolution (Pixi, IndexedDB)' },
      { href: '/guides/mix/', label: 'Building your mix' },
      { href: '/guides/ducking/', label: 'Sidechain ducking' },
      { href: '/guides/runtime-timing/', label: 'Runtime timing' },
      { href: '/guides/errors/', label: 'Errors' },
      { href: '/guides/migration/', label: 'Migrating from Howler' },
    ],
  },
  {
    title: 'Recipes & examples',
    items: [
      { href: '/recipes/', label: 'Recipes' },
      { href: '/examples/', label: 'All examples' },
      { href: '/examples/music/', label: 'Music: intro, loop, outro' },
      { href: '/examples/sprite/', label: 'Sprite' },
      { href: '/examples/variants/', label: 'Variants' },
      { href: '/examples/stream/', label: 'StreamSound' },
      { href: '/examples/spatializer/', label: 'Spatializer' },
      { href: '/examples/snapshot-blend/', label: 'Snapshot blend (live)' },
      { href: '/playground/mixer/', label: 'Mixer playground (live)' },
    ],
  },
  {
    title: 'Reference',
    items: [
      { href: '/reference/', label: 'Overview' },
      { href: '/api/', label: 'API (TypeDoc)' },
      { href: '/reference/cli/', label: 'CLI' },
      { href: '/reference/loudness-codecs/', label: 'Loudness & codec helpers' },
    ],
  },
];

/** Every docs page in reading order, for previous/next. */
export const DOCS_ORDER: NavItem[] = DOCS_NAV.flatMap((s) => s.items);

/** The section a path belongs to, matched on the longest sidebar href. */
export function sectionOf(pathname: string): NavSection | undefined {
  const path = pathname.endsWith('/') ? pathname : `${pathname}/`;
  return DOCS_NAV.find((s) => s.items.some((i) => i.href === path));
}

export const TOP_NAV = [
  { href: '/docs/', label: 'Docs' },
  { href: '/concepts/', label: 'Concepts' },
  { href: '/fx/', label: 'FX' },
  { href: '/guides/', label: 'Guides' },
  { href: '/recipes/', label: 'Recipes' },
  { href: '/examples/', label: 'Examples' },
  { href: '/changelog/', label: 'Changelog' },
];

/** Smaller utility links rendered next to the GitHub button. */
export const TOP_NAV_UTILITY = [
  { href: '/api/', label: 'API' },
  { href: '/llms.txt', label: 'llms.txt' },
];
