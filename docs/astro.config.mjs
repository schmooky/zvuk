import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://zvuk.dev',
  integrations: [mdx(), react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
    // @schmooky/zvuk is a workspace package whose `exports` resolve to `src/index.ts`.
    // Vite needs it bundled (not externalized) so it's transformed as TS.
    ssr: { noExternal: ['@schmooky/zvuk'] },
    optimizeDeps: { exclude: ['@schmooky/zvuk'] },
  },
});
