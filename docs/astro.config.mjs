import { execFileSync } from 'node:child_process';
import path from 'node:path';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

/**
 * Last commit date for a page's source file, so sitemap lastmod reflects
 * when the page actually changed rather than when CI happened to run.
 * Falls back to the build date for generated routes and shallow clones.
 */
const mtimeCache = new Map();
function lastModified(file) {
  if (mtimeCache.has(file)) return mtimeCache.get(file);
  let iso = new Date().toISOString();
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cI', '--', file], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (out) iso = out;
  } catch {
    /* not a git checkout, or the file is generated */
  }
  mtimeCache.set(file, iso);
  return iso;
}

/** Section weights. The quickstart and concepts are the entry points. */
const PRIORITY = [
  [/^\/$/, 1.0],
  [/^\/docs\//, 0.9],
  [/^\/concepts\//, 0.9],
  [/^\/guides\//, 0.8],
  [/^\/recipes\//, 0.7],
  [/^\/fx\//, 0.7],
  [/^\/examples\//, 0.6],
  [/^\/api\//, 0.5],
  [/^\/changelog\//, 0.4],
];

export default defineConfig({
  site: 'https://zvuk.schmooky.dev',
  integrations: [
    mdx(),
    react(),
    sitemap({
      // The pop-out mixer is a tool, not a document, and carries noindex.
      filter: (page) => !page.includes('/playground/'),
      serialize: (item) => {
        const pathname = new URL(item.url).pathname;
        const rel = pathname === '/' ? 'index' : pathname.replace(/^\/|\/$/g, '');
        const source = path.join('src', 'pages', `${rel}.astro`);
        return {
          ...item,
          lastmod: lastModified(source),
          priority: PRIORITY.find(([re]) => re.test(pathname))?.[1] ?? 0.5,
          changefreq: pathname.startsWith('/api/') ? 'monthly' : 'weekly',
        };
      },
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
    // @schmooky/zvuk is a workspace package whose `exports` resolve to `src/index.ts`.
    // Vite needs it bundled (not externalized) so it's transformed as TS.
    ssr: { noExternal: ['@schmooky/zvuk'] },
    optimizeDeps: { exclude: ['@schmooky/zvuk'] },
  },
});
