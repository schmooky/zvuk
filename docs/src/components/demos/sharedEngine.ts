import { type BusConfig, type Engine, type EngineState, createEngine } from '@schmooky/zvuk';

/**
 * One engine for every demo on the page.
 *
 * Each demo used to construct its own. Four demos on a page meant four
 * AudioContexts, four unlock gestures before anything made a sound, and four
 * fetches of the same sample, because the decode cache is per-engine.
 * Browsers also cap how many AudioContexts a document may hold, so a long
 * page could simply run out.
 *
 * Astro islands don't share a React tree, so this is module state rather than
 * a context provider. Vite emits one chunk for this module and every island
 * imports it, which makes the singleton genuinely singular per page.
 */

/**
 * The union of every bus any demo asks for. Topology is fixed at
 * construction, so it has to be declared here; individual demos adjust
 * levels and concurrency on the buses they care about when they start.
 */
export const DEMO_BUSES: Record<string, BusConfig> = {
  music: { level: 0.7 },
  drums: { level: 0 },
  sfx: { level: 1 },
  voice: { level: 1 },
  ambience: { level: 0.6 },
  ui: { level: 0.7 },
};

let engine: Engine | null = null;
let state: EngineState = 'cold';
const listeners = new Set<(s: EngineState) => void>();

function emit(s: EngineState): void {
  state = s;
  for (const fn of listeners) fn(s);
}

/** Construct the engine if needed. Does not touch the AudioContext. */
export function getDemoEngine(): Engine {
  if (!engine) {
    engine = createEngine({
      buses: DEMO_BUSES,
      master: { headroom: -3, limiter: { threshold: -1 } },
    });
    engine.onStateChange(emit);
  }
  return engine;
}

/** The engine, but only once something has constructed it. */
export function peekDemoEngine(): Engine | null {
  return engine;
}

export function getDemoState(): EngineState {
  return state;
}

export function subscribeDemoState(fn: (s: EngineState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Resume the shared context. Call from a user gesture. */
export async function unlockDemoEngine(): Promise<Engine> {
  const e = getDemoEngine();
  await e.unlock();
  return e;
}

/**
 * Apply a demo's per-bus settings to the shared engine. Demos declare the
 * shape they want to demonstrate; whichever one the reader last touched wins,
 * which is the same thing that happened when each owned its own engine.
 */
export function applyBusConfig(config: Record<string, BusConfig> | undefined): void {
  const e = peekDemoEngine();
  if (!e || !config) return;
  for (const [name, cfg] of Object.entries(config)) {
    if (!(name in DEMO_BUSES)) continue;
    const bus = e.bus(name);
    if (cfg.level != null) bus.level = cfg.level;
    if (cfg.mute != null) bus.muted = cfg.mute;
    bus.setConcurrency(cfg.concurrency ?? null);
  }
}

/** Stop every voice currently sounding on the named buses. */
export function stopVoicesOn(buses: readonly string[]): void {
  const e = peekDemoEngine();
  if (!e) return;
  for (const name of buses) {
    if (!(name in DEMO_BUSES)) continue;
    for (const v of e.bus(name).voices()) v.stop({ fade: 0.02 });
  }
}
