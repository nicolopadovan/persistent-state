import { persistentState } from '@nicolopadovan/persistent-state'
import { z } from 'zod'

export const profile = persistentState('profile', {
  default: { name: 'Ada', visits: 0 },
  schema: z.object({ name: z.string(), visits: z.number() }),
  version: 2,
  migrate: (stored) => {
    const old = z.object({ username: z.string() }).parse(stored)
    return { name: old.username, visits: 0 }
  },
})

export const draft = persistentState('draft', { default: '', storage: 'sessionStorage' })
