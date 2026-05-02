# Changesets

This folder is used by [Changesets](https://github.com/changesets/changesets) for versioning.

## Adding a changeset

```bash
pnpm changeset
```

Pick `zvuk` (the only published package), choose patch/minor/major, and write a one-line summary
focused on user-visible behavior. When the PR merges to `main`, a "Version Packages" PR will open;
merging that PR publishes to npm.
