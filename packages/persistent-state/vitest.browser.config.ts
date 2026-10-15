import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: import.meta.dirname,
  optimizeDeps: { include: ['react', 'react/jsx-dev-runtime', 'react-dom/client', 'react-dom/server'] },
  test: {
    include: ['test/browser/**/*.test.ts', 'test/browser/**/*.test.tsx'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
  },
})
