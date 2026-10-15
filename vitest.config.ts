import path from 'node:path'
import { configDefaults, defineConfig } from 'vitest/config'

const src = path.resolve(import.meta.dirname, 'packages/persistent-state/src')

export default defineConfig({
  root: import.meta.dirname,
  resolve: {
    alias: [
      { find: /^@nicolopadovan\/persistent-state\/(.+)$/, replacement: `${src}/$1` },
      { find: /^@nicolopadovan\/persistent-state$/, replacement: `${src}/index.ts` },
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['packages/**/*.test.ts', 'packages/**/*.test.tsx', 'apps/**/*.test.ts', 'apps/**/*.test.tsx'],
    exclude: [...configDefaults.exclude, '**/test/browser/**'],
  },
})
