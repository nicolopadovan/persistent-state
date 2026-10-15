import { defineConfig } from 'vitest/config'
import rootConfig from '../../vitest.config.ts'

export default defineConfig({
  ...rootConfig,
  root: import.meta.dirname,
  test: {
    ...rootConfig.test,
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
  },
})
