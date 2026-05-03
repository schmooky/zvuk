// ASSETS:
//   ./assets/pop.wav  — short gem-pop one-shot.

import { createEngine } from '../../src/index';

const trigger = document.getElementById('trigger') as HTMLButtonElement;
const big = document.getElementById('big') as HTMLButtonElement;
const meter = document.getElementById('meter') as HTMLDivElement;
const pops = document.getElementById('pops') as HTMLDivElement;

const engine = createEngine({
  buses: {
    sfx: { level: 1, concurrency: { max: 8, steal: 'oldest' } },
  },
  master: { headroom: -3 },
});

async function setup(): Promise<void> {
  await engine.unlock();
  await engine.loadSound('pop', './assets/pop.wav', { bus: 'sfx', normalize: true });
  meter.textContent = 'ready — click to cascade';
}

function cascade(count: number): void {
  pops.innerHTML = '';
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      engine.sound('pop').play({
        pitch: 1 + i * 0.05 + (Math.random() * 0.04 - 0.02),
        volume: { jitter: 0.05 },
      });
      const tag = document.createElement('span');
      tag.className = 'pop';
      tag.textContent = `voice #${i + 1}`;
      pops.appendChild(tag);
      meter.textContent = `live voices: ${engine.bus('sfx').voiceCount}`;
    }, i * 60);
  }
}

trigger.addEventListener('click', async () => {
  if (engine.state === 'cold') await setup();
  cascade(6);
});
big.addEventListener('click', async () => {
  if (engine.state === 'cold') await setup();
  cascade(20);
});
