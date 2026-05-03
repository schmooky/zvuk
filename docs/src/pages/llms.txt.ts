import type { APIRoute } from 'astro';
import { SITE } from '../lib/seo';

/**
 * llms.txt — the AI-readable index of the docs site.
 *
 * Convention: https://llmstxt.org/. The format is intentionally minimal so
 * any agent (or human, or feed reader) can ingest the site's structure
 * without scraping HTML. We mirror slotplate's shape: H1 + tagline blockquote
 * + a single `## Docs` section with one bullet per canonical page.
 *
 * Keep entries in publication order — agents tend to use the first match they
 * find when disambiguating a topic, so put the canonical page above any
 * derivative ones.
 */

interface Entry {
  href: string;
  title: string;
  desc: string;
}

const ENTRIES: Entry[] = [
  { href: '/', title: 'zvuk — audio engine for the web', desc: 'Wwise-grade audio engine in a tiny ESM package: lazy AudioContext, mixer buses, sidechain ducking, snapshots, audio sprites, codec-aware loading.' },
  { href: '/docs/', title: 'What is zvuk?', desc: 'High-level intro: what zvuk is, who it\'s for, what it ships in v0.0.x.' },
  { href: '/docs/quickstart/', title: 'Quickstart', desc: 'createEngine + unlock + loadSound + play, in 30 lines, with the iOS-Safari unlock dance.' },
  { href: '/docs/why/', title: 'Why another audio lib?', desc: 'How zvuk compares to Howler, Tone.js, and the bare Web Audio API.' },
  { href: '/concepts/', title: 'Concepts index', desc: 'The mental model — Engine, Mixer, Bus, Sound, Voice, Snapshot, Parameter, Concurrency, Spatializer.' },
  { href: '/concepts/engine/', title: 'Engine', desc: 'The root object. Lazy AudioContext, bus graph, scheduler, sound registry. Includes loadSprite, loadStream, crossfade, did-you-mean errors.' },
  { href: '/concepts/mixer/', title: 'Mixer', desc: 'Declarative bus topology with FX inserts, sidechain, concurrency, optional master limiter.' },
  { href: '/concepts/bus/', title: 'Bus', desc: 'Single-bus details — level, mute, fades, FX chain, voice tracking.' },
  { href: '/concepts/sound/', title: 'Sound', desc: 'A loaded sample. Spawns voices on play(). Loudness normalization on load.' },
  { href: '/concepts/voice/', title: 'Voice', desc: 'One playback instance. fade, pause, resume, setPlaybackRate, voice.spatializer for live binding, async cues iterator.' },
  { href: '/concepts/snapshot/', title: 'Snapshot', desc: 'Capture and crossfade the whole mix state — buses + parameters.' },
  { href: '/concepts/parameter/', title: 'Parameter', desc: 'Named float you can subscribe to and bind to anything (gain, frequency, custom).' },
  { href: '/concepts/concurrency/', title: 'Concurrency', desc: 'Per-bus voice limits and stealing strategies (oldest, lowest-priority, none).' },
  { href: '/concepts/spatializer/', title: 'Spatializer', desc: '2D pan via StereoPannerNode, 3D HRTF via PannerNode. Live setPan/setPosition through voice.spatializer.' },
  { href: '/fx/', title: 'FX index', desc: 'Compressor, filter, reverb, ducker, pitch/time-stretch — all swappable on a bus FX chain.' },
  { href: '/fx/compressor/', title: 'Compressor', desc: 'DynamicsCompressorNode with makeup gain. Live config updates, bypass.' },
  { href: '/fx/filter/', title: 'Filter', desc: 'BiquadFilter wrapper — lowpass, highpass, bandpass, notch, peaking, allpass.' },
  { href: '/fx/reverb/', title: 'Reverb', desc: 'ConvolverNode plus a synthetic IR generator for when you don\'t have a real impulse.' },
  { href: '/fx/pitch/', title: 'Pitch & time-stretch', desc: 'Cheap playbackRate (alters pitch+tempo), offline pitch-preserving SOLA stretch, realtime AudioWorklet stretch with automatable param.' },
  { href: '/guides/', title: 'Guides index', desc: 'Task-oriented recipes — asset formats, loading, mix building, ducking, migration.' },
  { href: '/guides/asset-formats/', title: 'Asset formats (webm/m4a)', desc: 'The codec ladder, ffmpeg pipeline, and how `npx zvuk transcode` automates it.' },
  { href: '/guides/loading/', title: 'Loading sounds', desc: 'Single, bulk, with progress and abort. Long media via loadStream. Sprites. Normalize on load. Typed banks via npx zvuk gen.' },
  { href: '/guides/mix/', title: 'Building your mix', desc: 'Bus topology that scales past day one — naming, levels, fades, snapshots.' },
  { href: '/guides/ducking/', title: 'Sidechain ducking', desc: 'Music breathing under SFX/voice via the Ducker FX insert.' },
  { href: '/guides/migration/', title: 'Migrating from Howler', desc: 'Side-by-side mapping — Howl/play/sprite → Sound/Voice/Sprite.' },
  { href: '/recipes/', title: 'Recipes index', desc: 'Short, copy-paste-ready solutions to common shapes.' },
  { href: '/playground/mixer/', title: 'Playground — mixer', desc: 'Live mixer dashboard running a real engine with three buses and pre-loaded SFX.' },
  { href: '/api/', title: 'API reference', desc: 'Auto-generated TypeDoc reference for every public symbol. Regenerated each build from src/index.ts.' },
  { href: '/changelog/', title: 'Changelog', desc: 'Every changeset rendered in chronological order. Built from .changeset/*.md.' },
  { href: '/roadmap/', title: 'Roadmap', desc: 'What\'s next, prioritised and sized. v0.0.2 swept Tiers 1–4 of the original list.' },
];

const TAGLINE = 'Wwise-grade web audio in a tiny ESM package — lazy AudioContext, mixer buses, sidechain ducking, snapshots, sprites, codec-aware loading.';

function render(): string {
  const lines: string[] = [];
  lines.push(`# ${SITE.name}`);
  lines.push('');
  lines.push(`> ${TAGLINE}`);
  lines.push('');
  lines.push('## Docs');
  lines.push('');
  for (const e of ENTRIES) {
    const url = new URL(e.href, SITE.url).toString();
    lines.push(`- [${e.title}](${url}): ${e.desc}`);
  }
  lines.push('');
  return lines.join('\n');
}

export const GET: APIRoute = () => {
  return new Response(render(), {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
