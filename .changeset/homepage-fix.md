---
'@schmooky/zvuk': patch
---

Fix `homepage` in package.json to point at the actual docs deploy
(`https://zvuk.schmooky.dev`). v0.1.0 shipped with the wrong URL, so
the npmjs.com page links to a non-existent domain. No code changes —
this republishes the manifest with the correct metadata.

Bundled doc fixes that came in alongside the rename (carried so the
release notes describe what landed on the docs site):

- Navbar version pill is now dynamic — reads `package.json#version`
  via SITE.version, so it stays in sync with whatever changesets
  publishes.
- Navbar adds an npm icon-button linking to the package page.
- Footer npm link uses the scoped name (`@schmooky/zvuk`) instead of
  the rejected unscoped one.
- `/changelog/` page now sources from the root `CHANGELOG.md`
  (one card per published version, grouped by bump, with commit SHA
  and `@author` per bullet, deep-linkable `#v<version>` anchors).
  Replaces the previous "list pending changesets" view, which only
  showed unreleased work.
- Hero badge and "What's in v…" heading also bind to SITE.version.
- docs/index "What's coming" list rewritten to point at the roadmap
  (it had been listing items that already shipped).
