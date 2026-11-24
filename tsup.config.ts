import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', cli: 'src/cli/index.ts' },
  format: ['esm'],
  // Types for the library only: the CLI is a bin, nobody imports it.
  dts: { entry: { index: 'src/index.ts' }, resolve: true, compilerOptions: { rootDir: 'src' } },
  tsconfig: './tsconfig.build.json',
  // No maps in the tarball: a 300 KB map nobody downloads on purpose, and a
  // `sourceMappingURL` to a file that isn't shipped makes bundlers warn.
  sourcemap: false,
  clean: true,
  treeshake: true,
  target: 'es2022',
  splitting: false,
  minify: true,
});
