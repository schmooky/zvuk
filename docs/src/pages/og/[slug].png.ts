import { OGImageRoute } from 'astro-og-canvas';

/**
 * Per-page social card. Generated at build time from a static page list — keep
 * the manifest in sync with the canonical doc routes (concept/fx/guide pages).
 *
 * If astro-og-canvas isn't installed yet, the build will fail loudly here;
 * that's better than silently shipping no OG images.
 */

const PAGES: Record<string, { title: string; description: string }> = {
  index: { title: 'zvuk', description: 'Audio engine for the web. Wwise-grade routing in a tiny ESM package.' },
  quickstart: { title: 'Quickstart', description: 'Up and running with zvuk in 30 lines.' },
  why: { title: 'Why zvuk?', description: 'How zvuk compares to Howler, Tone.js, and the bare Web Audio API.' },
  engine: { title: 'Engine', description: 'Lazy AudioContext, master + buses + voices.' },
  bus: { title: 'Bus', description: 'Mix bucket with FX, sidechain, concurrency.' },
  voice: { title: 'Voice', description: 'One playback instance — fade, pause, stop.' },
  sound: { title: 'Sound', description: 'Loaded buffer; spawns voices.' },
  spatializer: { title: 'Spatializer', description: '2D pan and 3D HRTF panner per voice.' },
  snapshot: { title: 'Snapshot', description: 'Capture/restore the mix.' },
  parameter: { title: 'Parameter', description: 'Named float; bind to gain, freq, anything.' },
  concurrency: { title: 'Concurrency', description: 'Voice limits + stealing strategies.' },
  compressor: { title: 'Compressor', description: 'Dynamics compressor with makeup gain.' },
  filter: { title: 'Filter', description: 'BiquadFilter wrapper.' },
  reverb: { title: 'Reverb', description: 'Convolution + synthetic IR.' },
  ducker: { title: 'Ducker', description: 'Sidechain ducking.' },
  pitch: { title: 'Pitch & time-stretch', description: 'Pitch-preserving granular stretch.' },
  ducking: { title: 'Sidechain ducking guide', description: 'Mix bed and SFX without fighting.' },
  loading: { title: 'Loading sounds', description: 'Codec ladder, abort, prefetch.' },
  mix: { title: 'Building your mix', description: 'Bus topology that scales past day one.' },
  'asset-formats': { title: 'Asset formats', description: 'webm/opus + m4a/aac, the why and the how.' },
  migration: { title: 'Migrating from Howler', description: 'Side-by-side mapping.' },
  roadmap: { title: 'Roadmap', description: 'What\'s next in zvuk.' },
  api: { title: 'API reference', description: 'Auto-generated TypeDoc reference.' },
  changelog: { title: 'Changelog', description: 'Every changeset, rendered.' },
};

export const { getStaticPaths, GET } = OGImageRoute({
  param: 'slug',
  pages: PAGES,
  getImageOptions: (_path, page) => ({
    title: page.title,
    description: page.description,
    bgGradient: [[12, 12, 16], [30, 35, 64]],
    border: { color: [79, 108, 247], width: 4 },
    padding: 60,
    font: {
      title: { color: [255, 255, 255], size: 64, weight: 'Bold' },
      description: { color: [200, 200, 220], size: 28, lineHeight: 1.4 },
    },
  }),
});
