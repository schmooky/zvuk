// ASSETS:
//   ./assets/reel.wav   — one buffer with three regions (tick / stop / win-sting).
//   ./assets/music.webm — looping background bed.

import { createEngine } from '../../src/index';
import { Ducker } from '../../src/index';

const SYMBOLS = ['🍒', '🍋', '⭐', '🍉', '7️⃣', '🍇'];
const reels = [0, 1, 2].map((i) => document.getElementById(`r${i}`) as HTMLDivElement);
const spinBtn = document.getElementById('spin') as HTMLButtonElement;
const meter = document.getElementById('meter') as HTMLDivElement;

const engine = createEngine({
  buses: {
    music: { level: 0.6 },
    sfx: { level: 1, concurrency: { max: 16, steal: 'oldest' } },
  },
  master: { headroom: -3, limiter: { threshold: -0.5 } },
});

async function setup(): Promise<void> {
  await engine.unlock();
  await engine.loadSprite(
    'reel',
    './assets/reel.wav',
    {
      tick: { start: 0, duration: 0.06 },
      stop: { start: 0.1, duration: 0.18 },
      'win-sting': { start: 0.5, duration: 1.2 },
    },
    { bus: 'sfx' },
  );
  await engine.loadSound('music', './assets/music.webm', { bus: 'music' });

  // Sidechain music under sfx — the win-sting will breathe under it.
  const ducker = new Ducker(engine.context, {
    source: engine.bus('sfx').output,
    target: engine.bus('music'),
    amount: 0.7,
    attack: 40,
    release: 600,
    threshold: 0.04,
  });
  engine.bus('music').addFx(ducker);

  engine.sound('music').play({ loop: true, volume: 0.5 });
  meter.textContent = 'ready';
}

async function spin(): Promise<void> {
  spinBtn.disabled = true;
  for (let i = 0; i < 3; i++) {
    const target = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]!;
    for (let t = 0; t < 8; t++) {
      reels[i]!.textContent = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]!;
      engine.sprite('reel').play('tick', { volume: { jitter: 0.05 } });
      await sleep(60);
    }
    reels[i]!.textContent = target;
    engine.sprite('reel').play('stop');
    await sleep(140);
  }
  if (reels[0]!.textContent === reels[1]!.textContent && reels[1]!.textContent === reels[2]!.textContent) {
    engine.sprite('reel').play('win-sting');
    meter.textContent = 'WIN — sidechain ducking active';
  } else {
    meter.textContent = 'no match';
  }
  spinBtn.disabled = false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

spinBtn.addEventListener('click', () => {
  if (engine.state === 'cold') {
    setup().then(() => spin());
  } else {
    spin();
  }
});
