// Two looping layers on two buses. Two snapshots capture two mix shapes.
// The slider drives engine.blendSnapshots() to interpolate between them.

import { createEngine, type Snapshot } from '../../src/index';

const startBtn = document.getElementById('start') as HTMLButtonElement;
const stopBtn = document.getElementById('stop') as HTMLButtonElement;
const slider = document.getElementById('tension') as HTMLInputElement;
const sliderVal = document.getElementById('tension-val') as HTMLSpanElement;
const calmBtn = document.getElementById('preset-calm') as HTMLButtonElement;
const midBtn = document.getElementById('preset-mid') as HTMLButtonElement;
const combatBtn = document.getElementById('preset-combat') as HTMLButtonElement;
const musicLevel = document.getElementById('music-level') as HTMLSpanElement;
const drumsLevel = document.getElementById('drums-level') as HTMLSpanElement;

const engine = createEngine({
  buses: {
    music: { level: 0.6 },
    drums: { level: 0.0 },
  },
  master: { headroom: -3, limiter: { threshold: -1 } },
});

let calm: Snapshot | null = null;
let combat: Snapshot | null = null;
let started = false;

async function start(): Promise<void> {
  await engine.unlock();
  await Promise.all([
    engine.loadSound('music', '/docs/public/audio/music-a.mp3', { bus: 'music' }),
    engine.loadSound('drums', '/docs/public/audio/music-b.mp3', { bus: 'drums' }),
  ]);

  // Capture the two mix shapes. The engine state at the moment of capture
  // is what's frozen — so we set the levels we want first, then snapshot.
  engine.bus('music').level = 0.6;
  engine.bus('drums').level = 0.0;
  calm = engine.captureSnapshot('calm');

  engine.bus('music').level = 0.25;
  engine.bus('drums').level = 0.85;
  combat = engine.captureSnapshot('combat');

  // Start both layers looping. They both play forever; the snapshot blend
  // is what dictates which one you hear.
  engine.sound('music').play({ loop: true });
  engine.sound('drums').play({ loop: true });

  // Wire the slider to a Parameter -> blendSnapshots subscription.
  const tension = engine.parameter('tension', 0);
  tension.subscribe((t) => {
    if (calm && combat) engine.blendSnapshots(calm, combat, t);
  });

  slider.addEventListener('input', () => {
    const t = Number(slider.value);
    sliderVal.textContent = t.toFixed(2);
    tension.set(t);
  });

  const setPreset = (t: number): void => {
    slider.value = String(t);
    sliderVal.textContent = t.toFixed(2);
    tension.set(t);
  };
  calmBtn.addEventListener('click', () => setPreset(0));
  midBtn.addEventListener('click', () => setPreset(0.5));
  combatBtn.addEventListener('click', () => setPreset(1));

  // Live meter readout — the levels are what blendSnapshots is writing.
  const tick = (): void => {
    musicLevel.textContent = engine.bus('music').level.toFixed(2);
    drumsLevel.textContent = engine.bus('drums').level.toFixed(2);
    if (started) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  started = true;
  slider.disabled = false;
  startBtn.disabled = true;
  stopBtn.disabled = false;
  tension.set(0);
}

async function stop(): Promise<void> {
  started = false;
  await engine.close();
  startBtn.disabled = false;
  stopBtn.disabled = true;
  slider.disabled = true;
  musicLevel.textContent = '—';
  drumsLevel.textContent = '—';
}

startBtn.addEventListener('click', () => {
  start().catch((err) => {
    console.error(err);
    startBtn.disabled = false;
  });
});
stopBtn.addEventListener('click', () => {
  stop().catch(console.error);
});
