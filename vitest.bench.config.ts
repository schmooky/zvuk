import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    setupFiles: ['./test/setup.ts'],
    include: ['bench/**/*.bench.ts'],
    benchmark: {
      include: ['bench/**/*.bench.ts'],
    },
  },
});
