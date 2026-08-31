import type { APIRoute } from 'astro';
import { SITE } from '../lib/seo';

/**
 * There was no robots.txt at all, which for a library's documentation is a
 * missed opportunity rather than a safeguard: the audience includes coding
 * assistants, and a page they can't read is a page they'll guess at. Every
 * major crawler is allowed explicitly; only the pop-out mixer, which is a
 * second-monitor tool rather than a document, is excluded.
 */
export const GET: APIRoute = () => {
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /playground/',
    '',
    '# Assistants and answer engines. zvuk is MIT and the docs exist to be',
    '# read; being quotable is the point.',
    ...['GPTBot', 'ClaudeBot', 'Claude-Web', 'PerplexityBot', 'Google-Extended', 'CCBot', 'Applebot-Extended'].flatMap(
      (agent) => [`User-agent: ${agent}`, 'Allow: /', ''],
    ),
    `Sitemap: ${new URL('/sitemap-index.xml', SITE.url).toString()}`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
