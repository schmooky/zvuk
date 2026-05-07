// ASSETS — uses Kenney "phaseJump1" as the click. Pulled straight from the
// docs site so this example runs out of the box if you serve from the repo
// root: /docs/public/audio/phaseJump1.ogg.
//
// What this demo shows:
//   - engine.scheduleAt(audioTime, fn) — sample-accurate dispatch, drift-free
//     vs. setInterval. The next click is always armed N seconds before the
//     previous one is due, so the schedule never falls behind the audio thread.
//   - bus.meter() — live RMS + peak on the click bus, animated at 60 fps.
//   - voice.level() — per-voice peak from the most-recently-spawned voice.

import { createEngine, type Voice } from '../../src/index';

const playBtn = document.getElementById('play') as HTMLButtonElement;
const meter = document.getElementById('meter') as HTMLDivElement;
const pulse = document.getElementById('pulse') as HTMLDivElement;
const busRmsEl = document.getElementById('busRms') as HTMLDivElement;
const busPeakEl = document.getElementById('busPeak') as HTMLDivElement;
const voicePeakEl = document.getElementById('voicePeak') as HTMLDivElement;
const bpmButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('button.bpm'));

const CLICK = ['/docs/public/audio/phaseJump1.ogg'];

const engine = createEngine({
  buses: { click: { level: 0.9 } },
  master: { headroom: -3, limiter: { threshold: -1 } },
});

let bpm = 120;
let running = false;
let nextClickAt = 0;
let scheduled: Array<() => void> = [];
let lastVoice: Voice | null = null;

async function setup(): Promise<void> {
  await engine.unlock();
  await engine.loadSound('click', CLICK, { bus: 'click', normalize: true });
  meter.textContent = 'ready';
  startMeterLoop();
}

function start(): void {
  if (running) return;
  running = true;
  playBtn.textContent = 'Stop';
  // Anchor the first click slightly in the future so the audio thread has
  // headroom to schedule it cleanly.
  nextClickAt = engine.now + 0.05;
  armNext();
}

function stop(): void {
  if (!running) return;
  running = false;
  playBtn.textContent = 'Start';
  for (const cancel of scheduled) cancel();
  scheduled = [];
}

function armNext(): void {
  if (!running) return;
  const at = nextClickAt;
  // Schedule the click, the visual pulse, AND the next arm-call all at the
  // same audio time. The arm-call's job is to advance the cursor and
  // re-enqueue itself — drift-free vs. setInterval because every tick is
  // anchored to the previous one's exact target.
  const cancel = engine.scheduleAt(at, () => {
    const v = engine.sound('click').play({ pitch: { jitter: 0.02 } });
    lastVoice = v;
    flashPulse();
    nextClickAt += 60 / bpm;
    armNext();
  });
  scheduled.push(cancel);
}

function flashPulse(): void {
  pulse.classList.add('flash');
  setTimeout(() => pulse.classList.remove('flash'), 70);
}

function startMeterLoop(): void {
  const tick = (): void => {
    const m = engine.bus('click').meter();
    busRmsEl.style.width = `${Math.min(100, m.rms * 200)}%`;
    busPeakEl.style.left = `${Math.min(100, m.peak * 100)}%`;

    if (lastVoice && !lastVoice.ended) {
      const lv = lastVoice.level();
      voicePeakEl.style.width = `${Math.min(100, lv.peak * 200)}%`;
    } else {
      voicePeakEl.style.width = '0%';
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

playBtn.addEventListener('click', async () => {
  if (engine.state === 'cold') await setup();
  if (running) stop();
  else start();
});

for (const b of bpmButtons) {
  b.addEventListener('click', () => {
    bpm = Number.parseInt(b.dataset.bpm ?? '120', 10);
    for (const x of bpmButtons) x.classList.remove('active');
    b.classList.add('active');
    if (running) {
      // Re-anchor the cursor so the BPM change takes effect at the next click,
      // not at the previous BPM's stale target.
      stop();
      start();
    }
  });
}
