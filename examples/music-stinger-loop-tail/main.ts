// ASSETS — reuses three pieces from the bundled docs audio. They're not
// musically tuned to each other (chip-lay isn't really an "intro" to
// music-a) but the three roles are illustrated, and dropping in your own
// {intro,loop,outro} stems is a one-liner change.

import { createEngine, type MusicVoice } from '../../src/index';

const playBtn = document.getElementById('play') as HTMLButtonElement;
const skipLoopEndBtn = document.getElementById('skipLoopEnd') as HTMLButtonElement;
const skipNowBtn = document.getElementById('skipNow') as HTMLButtonElement;
const stopBtn = document.getElementById('stop') as HTMLButtonElement;
const meter = document.getElementById('meter') as HTMLDivElement;
const segIntro = document.getElementById('seg-intro') as HTMLDivElement;
const segLoop = document.getElementById('seg-loop') as HTMLDivElement;
const segOutro = document.getElementById('seg-outro') as HTMLDivElement;

const engine = createEngine({
  buses: { music: { level: 0.7 } },
  master: { headroom: -3, limiter: { threshold: -1 } },
});

let live: MusicVoice | null = null;

async function setup(): Promise<void> {
  await engine.unlock();
  await engine.loadMusic(
    'theme',
    {
      intro: ['/docs/public/audio/chip-lay-1.webm', '/docs/public/audio/chip-lay-1.m4a'],
      loop: '/docs/public/audio/music-a.mp3',
      outro: ['/docs/public/audio/dice-throw-1.webm', '/docs/public/audio/dice-throw-1.m4a'],
    },
    { bus: 'music', loopCrossfade: 0.05 },
  );
  meter.textContent = 'ready';
}

function refreshButtons(): void {
  const playing = live != null;
  playBtn.disabled = playing;
  skipLoopEndBtn.disabled = !playing;
  skipNowBtn.disabled = !playing;
  stopBtn.disabled = !playing;
}

function paintSegments(): void {
  if (!live) {
    for (const seg of [segIntro, segLoop, segOutro]) seg.classList.remove('active');
    return;
  }
  segIntro.classList.toggle('active', live.currentPart === 'intro');
  segLoop.classList.toggle('active', live.currentPart === 'loop');
  segOutro.classList.toggle('active', live.currentPart === 'outro');
}

function startPainting(): void {
  const tick = (): void => {
    paintSegments();
    if (live) {
      meter.textContent = `currentPart: ${live.currentPart}`;
      requestAnimationFrame(tick);
    }
  };
  requestAnimationFrame(tick);
}

playBtn.addEventListener('click', async () => {
  if (engine.state === 'cold') await setup();
  if (live) return;
  live = engine.music('theme').play({ volume: 0.7, fadeIn: 0.2 });
  refreshButtons();
  startPainting();
  void live.ended.then(() => {
    live = null;
    paintSegments();
    refreshButtons();
    meter.textContent = 'ended naturally';
  });
});

skipLoopEndBtn.addEventListener('click', () => live?.skipToOutro({ at: 'loop-end' }));
skipNowBtn.addEventListener('click', () => live?.skipToOutro({ at: 'now' }));
stopBtn.addEventListener('click', () => live?.stop());

refreshButtons();
