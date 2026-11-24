/**
 * What's new in v2, in one place. The landing page and the changelog render
 * this list; the migration guide covers the breaking side. Add an entry
 * here when a v2 feature gets its own docs section.
 */
export interface V2Item {
  title: string;
  body: string;
  href: string;
  /** One of the six the landing page shows; the changelog lists them all. */
  headline?: boolean;
}

export const V2_RELEASE = '2.0.0';

export const V2_NEW: V2Item[] = [
  { title: 'Master fader', body: 'engine.master: volume, mute, fadeTo, headroom, limiter and meter on one object.', href: '/concepts/master/', headline: true },
  { title: 'Scheduled starts', body: 'play({ at }) on sounds, sprites, variants and music, sample-accurate on the audio clock.', href: '/concepts/sound/', headline: true },
  { title: 'Per-voice ducking', body: 'play({ duck }) pulls a bus down from the voice’s first sample until it ends.', href: '/fx/ducker/', headline: true },
  { title: 'Sidechain config that works', body: 'BusConfig.sidechain now inserts a Ducker, with a new threshold.', href: '/fx/ducker/' },
  { headline: true, title: 'Music tempo grid', body: 'With bpm on loadMusic you get nextBar(), onBeat() and skipToOutro({ at: "bar" }), plus pause and resume.', href: '/concepts/music/' },
  { headline: true, title: 'Per-sound limits', body: 'A { max, steal, cooldown } limit on a sound, sprite or variants bundle. Rejected voices never start.', href: '/concepts/concurrency/' },
  { title: 'Weighted variants', body: 'weights on loadVariants and variants.setWeights().', href: '/guides/loading/' },
  { title: 'The listener', body: 'engine.listener moves and turns the ears; spatializers glide and take a panning model.', href: '/concepts/spatializer/' },
  { headline: true, title: 'Pause menu', body: 'engine.suspend() and resume() give a pause that returning to the tab won’t undo.', href: '/concepts/engine/' },
  { title: 'Parameter.rampTo', body: 'Glide a parameter and everything bound to it; snapshot fades glide parameters too.', href: '/concepts/parameter/' },
  { title: 'Fuller snapshots', body: 'Snapshots capture and apply sends, FX bypass and solo.', href: '/concepts/snapshot/' },
  { title: 'Click-free FX', body: 'Filter and reverb changes glide, bypass crossfades, removeFx lets an insert move buses.', href: '/fx/' },
  { title: 'Loading', body: 'Byte progress, preload items of any kind, engine.unload() for every kind.', href: '/guides/loading/' },
];

/** The six the landing page shows. */
export const V2_HEADLINE: V2Item[] = V2_NEW.filter((i) => i.headline);
