// ASSETS — uses dice-throw + chips-collide as gem pops, drawn from
//   /docs/public/audio/.

import { createEngine } from '../../src/index';

const trigger = document.getElementById('trigger') as HTMLButtonElement;
const big = document.getElementById('big') as HTMLButtonElement;
const meter = document.getElementById('meter') as HTMLDivElement;
const pops = document.getElementById('pops') as HTMLDivElement;

const POP_VARIANTS = [
  ['/docs/public/audio/dice-throw-1.webm', '/docs/public/audio/dice-throw-1.m4a'],
  ['/docs/public/audio/chips-collide-1.webm', '/docs/public/audio/chips-collide-1.m4a'],
  ['/docs/public/audio/chip-lay-1.webm', '/docs/public/audio/chip-lay-1.m4a'],
];

const engine = createEngine({
  buses: {
    sfx: { level: 1, concurrency: { max: 8, steal: 'oldest' } },
  },
  master: { headroom: -3, limiter: { threshold: -1 } },
});

async function setup(): Promise<void> {
  await engine.unlock();
  await Promise.all(
    POP_VARIANTS.map((urls, i) =>
      engine.loadSound(`pop-${i}`, urls, { bus: 'sfx', normalize: true }),
    ),
  );
  meter.textContent = 'ready — click to cascade';
}

function cascade(count: number): void {
  pops.innerHTML = '';
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const variant = `pop-${i % POP_VARIANTS.length}`;
      engine.sound(variant).play({
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
