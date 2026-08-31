import { OGImageRoute } from 'astro-og-canvas';
import { OG_PAGES, type OgKind } from '../../lib/og-manifest';
import { SITE } from '../../lib/seo';

/**
 * Per-page social card, generated from the page manifest rather than a
 * hand-kept list. Three treatments:
 *
 * - home  — the waveform plate, wordmark-sized title, no eyebrow.
 * - docs  — section eyebrow, title, description, violet rule down the side.
 * - api   — monospace symbol name against a darker plate, cyan rule.
 *
 * All three carry the version and licence in the description rail, so a card
 * that shows up in a link preview says which release it describes.
 */

type CardKind = OgKind;

const RAIL = `zvuk v${SITE.version} · MIT · ${SITE.url.replace('https://', '')}`;

const pages = Object.fromEntries(
  Object.entries(OG_PAGES).map(([slug, page]) => [
    slug,
    {
      title: page.title,
      description: page.description,
      eyebrow: page.eyebrow,
      kind: page.kind,
    },
  ]),
);

const PLATE: Record<CardKind, [number, number, number][]> = {
  home: [
    [12, 12, 16],
    [12, 12, 16],
  ],
  docs: [
    [12, 12, 16],
    [30, 35, 64],
  ],
  api: [
    [9, 9, 12],
    [12, 26, 34],
  ],
};

const RULE: Record<CardKind, [number, number, number]> = {
  home: [79, 108, 247],
  docs: [79, 108, 247],
  api: [34, 211, 238],
};

export const { getStaticPaths, GET } = OGImageRoute({
  param: 'slug',
  pages,
  getImageOptions: (_path, page) => {
    const kind = (page.kind ?? 'docs') as CardKind;
    const heading = kind === 'home' ? SITE.name : page.title;
    // The eyebrow and the version rail bracket the description, so every
    // card reads section → title → summary → provenance top to bottom.
    const body = [page.eyebrow, page.description, RAIL].filter(Boolean).join('\n');
    return {
      title: heading,
      description: body,
      bgGradient: PLATE[kind],
      ...(kind === 'home'
        ? { bgImage: { path: './src/assets/og-wave.png', fit: 'cover' as const } }
        : {}),
      border: { color: RULE[kind], width: kind === 'home' ? 8 : 5, side: 'inline-start' as const },
      padding: 64,
      font: {
        title: {
          color: [255, 255, 255],
          size: kind === 'home' ? 96 : 60,
          weight: 'Bold' as const,
          lineHeight: 1.05,
        },
        description: {
          color: kind === 'api' ? [186, 230, 253] : [200, 200, 220],
          size: 26,
          lineHeight: 1.45,
        },
      },
    };
  },
});
