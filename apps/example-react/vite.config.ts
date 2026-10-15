import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // zod 4.6 places comments next to its `@__PURE__` annotations, which Rollup drops with a warning.
      onwarn(warning, warn) {
        if (warning.code === 'INVALID_ANNOTATION' && warning.id?.includes('/node_modules/zod/')) return
        warn(warning)
      },
    },
  },
})
