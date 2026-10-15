import { persistentState } from '@nicolopadovan/persistent-state'
import { z } from 'zod'

export const theme = persistentState('theme', {
  default: 'light',
  storage: 'cookie',
  schema: z.enum(['light', 'dark']),
})

export const draft = persistentState('draft', { default: '', debounceMs: 500 })
