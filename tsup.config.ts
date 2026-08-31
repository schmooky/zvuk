import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', cli: 'src/cli/index.ts' },
  format: ['esm'],
  dts: { resolve: true, compilerOptions: { rootDir: 'src' } },
  tsconfig: './tsconfig.build.json',
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: 'es2022',
  splitting: false,
  minify: true,
});
