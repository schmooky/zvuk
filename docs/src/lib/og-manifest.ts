import api from '../content/api.json';
import { SITE } from './seo';

export type OgKind = 'home' | 'docs' | 'api';

export interface OgPage {
  /** Route this card belongs to, e.g. `/concepts/bus/`. */
  route: string;
  title: string;
  description: string;
  /** Small label above the title. Empty for the home card. */
  eyebrow: string;
  kind: OgKind;
}

/**
 * Every .astro page source, read at build time. Deriving the manifest from
 * the pages themselves is the point: the old hand-written map covered 25
 * slugs against 130 routes, so most pages linked an OG image that was never
 * generated.
 */
const sources = import.meta.glob('/src/pages/**/*.astro', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** `/src/pages/concepts/bus.astro` → `/concepts/bus/`; index files → their directory. */
function routeOf(file: string): string {
  const rel = file.replace('/src/pages/', '').replace(/\.astro$/, '');
  if (rel === 'index') return '/';
  const trimmed = rel.replace(/\/index$/, '');
  return `/${trimmed}/`;
}

/**
 * Slug for a route. Full path, hyphen-joined, so `/api/Voice/` and
 * `/concepts/voice/` can't collide the way lowercased last segments did.
 */
export function ogSlug(route: string): string {
  const trimmed = route.replace(/^\//, '').replace(/\/$/, '');
  if (trimmed === '') return 'index';
  return trimmed.split('/').join('-').toLowerCase();
}

/** Pull a literal string out of `attr="..."` or `attr={`...`}` on a tag. */
function attr(tag: string, name: string): string | null {
  const quoted = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  if (quoted?.[1]) return decode(quoted[1]);
  const templated = tag.match(new RegExp(`\\b${name}=\\{\`([^\`]*)\``));
  if (templated?.[1]) {
    // Strip interpolations and the ` · zvuk` suffix they usually carry.
    const literal = templated[1].replace(/\$\{[^}]*\}/g, '').replace(/\s*·\s*$/, '').trim();
    if (literal) return decode(literal);
  }
  return null;
}

function decode(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\\'/g, "'");
}

/** The opening `<Docs …>` / `<Base …>` tag, attributes and all. */
function layoutTag(source: string): string | null {
  const m = source.match(/<(?:Docs|Base)\b[^>]*>/s);
  return m ? m[0] : null;
}

function titleFromRoute(route: string): string {
  const last = route.replace(/\/$/, '').split('/').pop();
  if (!last) return SITE.name;
  return last.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

function eyebrowFor(route: string): string {
  const section = route.split('/')[1] ?? '';
  const labels: Record<string, string> = {
    concepts: 'Concept',
    guides: 'Guide',
    fx: 'FX',
    docs: 'Docs',
    examples: 'Example',
    recipes: 'Recipe',
    api: 'API',
    changelog: 'Changelog',
    playground: 'Playground',
  };
  return labels[section] ?? '';
}

function pagesFromSources(): OgPage[] {
  const out: OgPage[] = [];
  for (const [file, source] of Object.entries(sources)) {
    // Dynamic routes are expanded from their own data below; the OG route
    // itself has no card.
    if (file.includes('[') || file.includes('/pages/og/')) continue;
    // Pages that ask not to be indexed don't need a social card either.
    if (/name=["']robots["']\s+content=["'][^"']*noindex/.test(source)) continue;

    const route = routeOf(file);
    const tag = layoutTag(source);
    const title = (tag && attr(tag, 'title')) ?? (route === '/' ? SITE.name : titleFromRoute(route));
    const description = (tag && attr(tag, 'description')) ?? SITE.description;
    out.push({
      route,
      title,
      description,
      eyebrow: route === '/' ? '' : ((tag && attr(tag, 'eyebrow')) ?? eyebrowFor(route)),
      kind: route === '/' ? 'home' : 'docs',
    });
  }
  return out;
}

interface ApiSymbol {
  name: string;
  comment?: { summary?: { text?: string }[] };
}

function pagesFromApi(): OgPage[] {
  const children = ((api as { children?: ApiSymbol[] })?.children ?? []) as ApiSymbol[];
  return children.map((c) => {
    const summary = (c.comment?.summary ?? [])
      .map((s) => s.text)
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    return {
      route: `/api/${c.name}/`,
      title: c.name,
      description: summary || `Reference for ${c.name}.`,
      eyebrow: 'API',
      kind: 'api' as const,
    };
  });
}

/** Every card the site needs, keyed by slug. */
export const OG_PAGES: Record<string, OgPage> = Object.fromEntries(
  [...pagesFromSources(), ...pagesFromApi()].map((p) => [ogSlug(p.route), p]),
);
