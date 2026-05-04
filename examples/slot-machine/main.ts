// ASSETS — pulled straight from the docs site so this example runs out of
// the box if you serve from the repo root:
//   /docs/public/audio/chip-lay-1.{webm,m4a}    → reel tick
//   /docs/public/audio/chips-collide-1.{webm,m4a} → reel stop
//   /docs/public/audio/card-shuffle.{webm,m4a}  → win sting
//   /docs/public/audio/music-a.mp3              → background bed (drop your own)

import { createEngine, Ducker } from '../../src/index';

const SYMBOLS = ['🍒', '🍋', '⭐', '🍉', '7️⃣', '🍇'];
const reels = [0, 1, 2].map((i) => document.getElementById(`r${i}`) as HTMLDivElement);
const spinBtn = document.getElementById('spin') as HTMLButtonElement;
const meter = document.getElementById('meter') as HTMLDivElement;

const ASSETS = {
  tick: ['/docs/public/audio/chip-lay-1.webm', '/docs/public/audio/chip-lay-1.m4a'],
  stop: ['/docs/public/audio/chips-collide-1.webm', '/docs/public/audio/chips-collide-1.m4a'],
  win: ['/docs/public/audio/card-shuffle.webm', '/docs/public/audio/card-shuffle.m4a'],
  music: '/docs/public/audio/music-a.mp3',
};

const engine = createEngine({
  buses: {
    music: { level: 0.5 },
    sfx: { level: 1, concurrency: { max: 16, steal: 'oldest' } },
  },
  master: { headroom: -3, limiter: { threshold: -0.5 } },
});

async function setup(): Promise<void> {
  await engine.unlock();
  await Promise.all([
    engine.loadSound('tick', ASSETS.tick, { bus: 'sfx', normalize: true }),
    engine.loadSound('stop', ASSETS.stop, { bus: 'sfx', normalize: true }),
    engine.loadSound('win', ASSETS.win, { bus: 'sfx', normalize: true }),
  ]);
  // Music streams in instead of decoding into RAM.
  const music = engine.loadStream('bed', ASSETS.music, { bus: 'music' });

  const ducker = new Ducker(engine.context, engine.bus('sfx'), {
    amount: 0.7,
    attack: 0.04,
    release: 0.6,
    threshold: 0.04,
  });
  engine.bus('music').addFx(ducker);

  await music.play({ loop: true, volume: 0.6 });
  meter.textContent = 'ready';
}

async function spin(): Promise<void> {
  spinBtn.disabled = true;
  for (let i = 0; i < 3; i++) {
    const target = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]!;
    for (let t = 0; t < 8; t++) {
      reels[i]!.textContent = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]!;
      engine.sound('tick').play({ volume: { jitter: 0.05 }, pitch: { jitter: 0.04 } });
      await sleep(60);
    }
    reels[i]!.textContent = target;
    engine.sound('stop').play();
    await sleep(140);
  }
  if (reels[0]!.textContent === reels[1]!.textContent && reels[1]!.textContent === reels[2]!.textContent) {
    engine.sound('win').play({ volume: 0.9 });
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
