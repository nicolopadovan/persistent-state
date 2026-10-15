import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import {
  persistentState,
  type PersistentState,
  type PersistentStateOptions,
  type StandardSchemaV1,
  type StorageKind,
} from '@nicolopadovan/persistent-state'

const Theme = z.enum(['light', 'dark', 'system'])
const Settings = z.object({ mode: Theme, size: z.number().default(1) })

describe('schema type inference', () => {
  it('infers the value type from the output of a zod 4 schema', () => {
    const theme = persistentState('theme', { default: 'system', schema: Theme })
    expectTypeOf(theme).toEqualTypeOf<PersistentState<'light' | 'dark' | 'system', 'localStorage'>>()
    expectTypeOf(theme.get()).toEqualTypeOf<'light' | 'dark' | 'system'>()
  })

  it('uses the output type, not the input type, of a schema that transforms', () => {
    const settings = persistentState('settings', {
      default: { mode: 'dark', size: 1 },
      schema: Settings,
    })
    expectTypeOf(settings.get()).toEqualTypeOf<{ mode: 'light' | 'dark' | 'system'; size: number }>()
  })

  it('keeps the storage kind of the options', () => {
    const theme = persistentState('theme', { default: 'dark', storage: 'cookie', schema: Theme, expires: 30 })
    expectTypeOf(theme).toEqualTypeOf<PersistentState<'light' | 'dark' | 'system', 'cookie'>>()
  })

  it('still infers from the default when there is no schema', () => {
    expectTypeOf(persistentState('count', { default: 0 }).get()).toEqualTypeOf<number>()
    expectTypeOf(persistentState('flag', { default: true, storage: 'sessionStorage' })).toEqualTypeOf<
      PersistentState<boolean, 'sessionStorage'>
    >()
  })

  it('checks the default and migrate against the schema output', () => {
    // @ts-expect-error 'blue' is not a member of the schema output
    persistentState('theme', { default: 'blue', schema: Theme })
    // @ts-expect-error migrate must return the schema output
    persistentState('theme', { default: 'dark', schema: Theme, version: 2, migrate: () => 'blue' })
    persistentState('theme', {
      default: 'dark',
      schema: Theme,
      version: 2,
      migrate: (stored, from) => (from === 0 && stored === 'night' ? 'dark' : 'light'),
    })
  })

  it('needs a cast to forward options typed as PersistentStateOptions', () => {
    const forward = <T, S extends StorageKind>(key: string, options: PersistentStateOptions<T, S>) =>
      persistentState(key, options as PersistentStateOptions<T, S> & { schema?: undefined })
    expectTypeOf(forward('theme', { default: 'dark', storage: 'cookie' })).toEqualTypeOf<
      PersistentState<string, 'cookie'>
    >()

    const rejected = <T, S extends StorageKind>(key: string, options: PersistentStateOptions<T, S>) => {
      // @ts-expect-error the general options type matches neither overload
      return persistentState(key, options)
    }
    expectTypeOf(rejected).toBeFunction()
  })

  it('accepts any Standard Schema and no cookie option for Web Storage expiry', () => {
    expectTypeOf(Theme).toExtend<StandardSchemaV1<unknown, 'light' | 'dark' | 'system'>>()
    persistentState('theme', { default: 'dark', schema: Theme, expires: new Date(0) })
    // @ts-expect-error path is a cookie attribute
    persistentState('theme', { default: 'dark', path: '/' })
  })
})
