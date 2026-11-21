import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

/**
 * The three bundles of Datardo: the main process, the bridge and the window. Everything is bundled, so that the
 * installer ships no node_modules (architecture: what "dependencies from a list" means).
 */
export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      externalizeDeps: false,
      rolldownOptions: {
        // The process of a playground's run (`playground.run`), the worker thread of a comparison (`compare.read`) and
        // the worker threads of `schema.analyze` are bundles of their own.
        input: {
          index: resolve('src/main/index.ts'),
          playground: resolve('src/main/playground/process-entry.ts'),
          pairing: resolve('src/runner/workers/pairing-entry.ts'),
          workers: resolve('src/runner/workers/entry.ts'),
        },
        external: ['electron'],
      },
    },
  },
  preload: {
    build: {
      outDir: 'out/preload',
      externalizeDeps: false,
      rolldownOptions: {
        input: { index: resolve('src/preload/index.ts') },
        external: ['electron'],
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: resolve('src/ui'),
    plugins: [react()],
    build: {
      outDir: 'out/ui',
      rolldownOptions: { input: { index: resolve('src/ui/index.html') } },
    },
  },
});
