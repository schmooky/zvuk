export interface NavItem {
  href: string;
  label: string;
}
export interface NavSection {
  title: string;
  items: NavItem[];
}

export const DOCS_NAV: NavSection[] = [
  {
    title: 'Start here',
    items: [
      { href: '/docs/', label: 'What is zvuk?' },
      { href: '/docs/quickstart/', label: 'Quickstart' },
      { href: '/docs/why/', label: 'Why another audio lib?' },
      { href: '/roadmap/', label: 'Roadmap' },
    ],
  },
  {
    title: 'Concepts',
    items: [
      { href: '/concepts/engine/', label: 'Engine' },
      { href: '/concepts/mixer/', label: 'Mixer' },
      { href: '/concepts/bus/', label: 'Bus' },
      { href: '/concepts/sound/', label: 'Sound' },
      { href: '/concepts/music/', label: 'Music' },
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
      { href: '/fx/compressor/', label: 'Compressor' },
      { href: '/fx/pitch/', label: 'Pitch & time-stretch' },
      { href: '/fx/reverb/', label: 'Reverb' },
      { href: '/fx/filter/', label: 'Filter' },
    ],
  },
  {
    title: 'Guides',
    items: [
      { href: '/guides/asset-formats/', label: 'Asset formats (webm/m4a)' },
      { href: '/guides/loading/', label: 'Loading sounds' },
      { href: '/guides/asset-resolution/', label: 'Asset resolution (Pixi, IndexedDB)' },
      { href: '/guides/mix/', label: 'Building your mix' },
      { href: '/guides/ducking/', label: 'Sidechain ducking' },
      { href: '/guides/runtime-timing/', label: 'Runtime timing' },
      { href: '/guides/migration/', label: 'Migrating from Howler' },
    ],
  },
  {
    title: 'Examples',
    items: [
      { href: '/examples/', label: 'All examples' },
      { href: '/examples/snapshot-blend/', label: 'Snapshot blend (live)' },
      { href: '/playground/mixer/', label: 'Mixer playground (live)' },
    ],
  },
];

export const TOP_NAV = [
  { href: '/docs/', label: 'Docs' },
  { href: '/concepts/', label: 'Concepts' },
  { href: '/fx/', label: 'FX' },
  { href: '/guides/', label: 'Guides' },
  { href: '/recipes/', label: 'Recipes' },
  { href: '/examples/', label: 'Examples' },
];

/** Smaller utility links rendered next to the GitHub button. */
export const TOP_NAV_UTILITY = [
  { href: '/api/', label: 'API' },
  { href: '/llms.txt', label: 'llms.txt' },
];
