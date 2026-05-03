// ASSETS — uses card-shuffle as a stand-in for a footstep loop, from
//   /docs/public/audio/.

import { createEngine } from '../../src/index';
import type { Voice } from '../../src/index';

const stage = document.getElementById('stage') as HTMLDivElement;
const source = document.getElementById('source') as HTMLDivElement;
const start = document.getElementById('start') as HTMLButtonElement;
const meter = document.getElementById('meter') as HTMLDivElement;

const FOOT = ['/docs/public/audio/card-shuffle.webm', '/docs/public/audio/card-shuffle.m4a'];

const engine = createEngine({
  buses: { sfx: { level: 1 } },
  master: { headroom: -3 },
});

let voice: Voice | null = null;
let active = false;

async function setup(): Promise<void> {
  await engine.unlock();
  await engine.loadSound('foot', FOOT, { bus: 'sfx', normalize: true });
  voice = engine.sound('foot').play({
    loop: true,
    pitch: { jitter: 0.05 },
    spatializer: { position: [0, 0, 0] },
  });
  active = true;
  meter.textContent = 'tracking pointer';
}

function setFromPointer(clientX: number, clientY: number): void {
  if (!active || !voice?.spatializer) return;
  const rect = stage.getBoundingClientRect();
  const cx = (clientX - rect.left) / rect.width - 0.5;
  const cy = (clientY - rect.top) / rect.height - 0.5;
  voice.spatializer.setPosition(cx * 8, 0, cy * 8);
  source.style.left = `${(cx + 0.5) * 100}%`;
  source.style.top = `${(cy + 0.5) * 100}%`;
}

stage.addEventListener('pointermove', (e) => setFromPointer(e.clientX, e.clientY));

start.addEventListener('click', () => {
  if (engine.state === 'cold') setup();
});
