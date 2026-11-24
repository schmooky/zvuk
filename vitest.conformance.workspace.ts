import { defineWorkspace } from 'vitest/config';

/**
 * Conformance suite. The fast suite runs against a hand-written Web Audio
 * fake, which is why several scheduling bugs shipped: the fake can't refuse
 * an illegal call or render a sample. These specs run in real browsers
 * against a real OfflineAudioContext and assert on rendered audio.
 *
 * Three engines, because they disagree on the parts that matter here.
 * Chromium and WebKit have `cancelAndHoldAtTime`; Firefox has none, which is
 * the reason curve.ts keeps its plain-cancel fallback.
 */
const browsers = ['chromium', 'webkit', 'firefox'] as const;

export default defineWorkspace(
  browsers.map((name) => ({
    test: {
      name: `conformance-${name}`,
      include: ['conformance/**/*.test.ts'],
      browser: {
        enabled: true,
        provider: 'playwright',
        name,
        headless: true,
        screenshotFailures: false,
      },
    },
  })),
);
