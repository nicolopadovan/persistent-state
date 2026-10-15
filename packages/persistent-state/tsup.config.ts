import { readFile, writeFile } from 'node:fs/promises'
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { index: 'src/index.ts', 'react/index': 'src/react/index.ts', next: 'src/next.tsx' },
  dts: true,
  format: ['esm'],
  clean: true,
  sourcemap: true,
  treeshake: { moduleSideEffects: false },
  external: ['react', /^next/, /^@nicolopadovan\/persistent-state/],
  async onSuccess() {
    // esbuild drops module directives; prepended on line 1 so the sourcemaps stay aligned.
    const entry = 'dist/react/index.js'
    await writeFile(entry, `'use client';${await readFile(entry, 'utf8')}`)
  },
})
