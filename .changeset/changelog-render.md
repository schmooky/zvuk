---
"@schmooky/zvuk": patch
---

Render changelog markdown on the docs site.

The `/changelog/` page was dumping each entry's body inside a `<pre>` tag, so bullets, bold, fenced code blocks, and links rendered as raw markdown noise (`- **Foo**` instead of a styled list). Two fixes:

- The build script (`docs/scripts/build-changelog.mjs`) now passes each bullet body through `marked` and stores the rendered HTML alongside the original markdown. Build-time only — no markdown parser ships to the browser. The parser also keeps blank lines between indented continuation lines so paragraphs in long entries don't get squished into a single block.
- The `/changelog/` Astro page injects the pre-rendered HTML through `set:html` and styles it with a scoped `.changelog-prose` block so paragraphs, lists, code spans, and fenced code all render properly.

No public API change — purely a docs-site fix.
