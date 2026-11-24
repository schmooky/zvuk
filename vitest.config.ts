import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    globals: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // The CLI entry shells out to ffmpeg and the worklet runs off-thread;
      // neither is reachable from the happy-dom suite. The CLI's planning
      // and code generation are covered by test/cli.test.ts.
      exclude: ['src/cli/index.ts', 'src/fx/stretch-worklet.ts'],
      reporter: ['text', 'html', 'json-summary'],
      // Floor, not a target. Raise it when a pass genuinely moves it.
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 70,
      },
    },
  },
});
