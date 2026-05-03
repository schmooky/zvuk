// ASSETS:
//   ./assets/footsteps-loop.wav  — short looping step pattern.

import { createEngine } from '../../src/index';
import type { Voice } from '../../src/index';

const stage = document.getElementById('stage') as HTMLDivElement;
const source = document.getElementById('source') as HTMLDivElement;
const start = document.getElementById('start') as HTMLButtonElement;
const meter = document.getElementById('meter') as HTMLDivElement;

const engine = createEngine({
  buses: { sfx: { level: 1 } },
  master: { headroom: -3 },
});

let voice: Voice | null = null;
let active = false;

async function setup(): Promise<void> {
  await engine.unlock();
  await engine.loadSound('foot', './assets/footsteps-loop.wav', { bus: 'sfx' });
  voice = engine.sound('foot').play({
    loop: true,
    pitch: { jitter: 0.05 },
    spatializer: { position: [0, 0, 0] },
  });
  active = true;
  meter.textContent = 'tracking cursor';
}

stage.addEventListener('mousemove', (e) => {
  if (!active || !voice?.spatializer) return;
  const rect = stage.getBoundingClientRect();
  const cx = (e.clientX - rect.left) / rect.width - 0.5;
  const cy = (e.clientY - rect.top) / rect.height - 0.5;
  // Map screen → world: x left/right, z forward/back, y constant.
  voice.spatializer.setPosition(cx * 8, 0, cy * 8);
  source.style.left = `${(cx + 0.5) * 100}%`;
  source.style.top = `${(cy + 0.5) * 100}%`;
});

start.addEventListener('click', () => {
  if (engine.state === 'cold') setup();
});
