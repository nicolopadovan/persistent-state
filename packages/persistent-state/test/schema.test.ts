import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  persistentState,
  PersistentStateError,
  readCookieState,
  type StandardSchemaV1,
  type StorageKind,
} from '@nicolopadovan/persistent-state'
import { freshPage, getRaw, putRaw, resetEnvironment, spyOnWrites } from './helpers'

const STORAGES: StorageKind[] = ['localStorage', 'sessionStorage', 'cookie']

const schemaOf = <T>(
  validate: (value: unknown) => StandardSchemaV1.Result<T> | Promise<StandardSchemaV1.Result<T>>,
): StandardSchemaV1<unknown, T> => ({ '~standard': { version: 1, vendor: 'test', validate } })

const positive = schemaOf<number>((value) =>
  typeof value === 'number' && value > 0
    ? { value }
    : { issues: [{ message: 'must be a positive number', path: ['count'] }] },
)

beforeEach(resetEnvironment)
afterEach(() => {
  vi.restoreAllMocks()
})

describe.each(STORAGES)('schema validation in %s', (storage) => {
  it('passes a valid stored value through', () => {
    putRaw(storage, 'k', '3')
    const onError = vi.fn()
    expect(persistentState('k', { default: 1, storage, schema: positive, onError }).get()).toBe(3)
    expect(onError).not.toHaveBeenCalled()
  })

  it('uses the value the schema returns', () => {
    putRaw(storage, 'k', '"  dark "')
    const trimmed = schemaOf<string>((value) => ({ value: String(value).trim() }))
    expect(persistentState('k', { default: 'light', storage, schema: trimmed }).get()).toBe('dark')
  })

  it('yields the default and reports invalid with the issues, leaving the stored item alone', () => {
    putRaw(storage, 'k', '-5')
    const writes = spyOnWrites(storage, 'k')
    const onError = vi.fn()
    const def = persistentState('k', { default: 1, storage, schema: positive, onError })
    expect(def.get()).toBe(1)
    expect(onError).toHaveBeenCalledTimes(1)
    const error = onError.mock.calls[0][0] as PersistentStateError
    expect(error).toBeInstanceOf(PersistentStateError)
    expect(error).toMatchObject({
      code: 'invalid',
      key: 'k',
      issues: [{ message: 'must be a positive number', path: ['count'] }],
    })
    expect(def.isPersistent()).toBe(true)
    expect(writes()).toBe(0)
    expect(getRaw(storage, 'k')).toBe('-5')
  })

  it('yields the default and reports async-schema for a schema that returns a promise', () => {
    putRaw(storage, 'k', '3')
    const writes = spyOnWrites(storage, 'k')
    const onError = vi.fn()
    const asyncSchema = schemaOf<number>((value) => Promise.resolve({ value: value as number }))
    expect(persistentState('k', { default: 1, storage, schema: asyncSchema, onError }).get()).toBe(1)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'async-schema', key: 'k' }))
    expect(writes()).toBe(0)
    expect(getRaw(storage, 'k')).toBe('3')
  })

  it('does not leave an unhandled rejection behind for a rejecting async schema', async () => {
    putRaw(storage, 'k', '3')
    const rejecting = schemaOf<number>(() => Promise.reject(new Error('boom')))
    const onError = vi.fn()
    expect(persistentState('k', { default: 1, storage, schema: rejecting, onError }).get()).toBe(1)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'async-schema' }))
  })

  it('reports invalid with the cause when the schema throws, and yields the default', () => {
    putRaw(storage, 'k', '3')
    const cause = new Error('schema bug')
    const throwing = schemaOf<number>(() => {
      throw cause
    })
    const onError = vi.fn()
    expect(persistentState('k', { default: 1, storage, schema: throwing, onError }).get()).toBe(1)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'invalid', cause }))
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
  ])('reports invalid, and nothing else, when validate returns %s', (_, result) => {
    putRaw(storage, 'k', '3')
    const onError = vi.fn()
    const broken = schemaOf<number>(() => result as unknown as StandardSchemaV1.Result<number>)
    const def = persistentState('k', { default: 1, storage, schema: broken, onError })
    expect(def.get()).toBe(1)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'invalid', key: 'k' }))
    expect(def.isPersistent()).toBe(true)
    expect(getRaw(storage, 'k')).toBe('3')
  })

  it('validates a stored value once, not on every get', () => {
    putRaw(storage, 'k', '3')
    const validate = vi.fn((value: unknown) => ({ value: value as number }))
    const def = persistentState('k', { default: 1, storage, schema: schemaOf(validate) })
    def.get()
    def.get()
    expect(validate).toHaveBeenCalledTimes(1)
  })

  it('does not validate when nothing is stored', () => {
    const validate = vi.fn((value: unknown) => ({ value: value as number }))
    expect(persistentState('k', { default: 1, storage, schema: schemaOf(validate) }).get()).toBe(1)
    expect(validate).not.toHaveBeenCalled()
  })

  it('writes a value that was set and reads it back through the schema', () => {
    persistentState('k', { default: 1, storage, schema: positive }).set(9)
    freshPage()
    expect(persistentState('k', { default: 1, storage, schema: positive }).get()).toBe(9)
  })
})

describe('zod 4', () => {
  const settings = z.object({ mode: z.enum(['light', 'dark']), size: z.number().int().min(1) })

  it('accepts a valid stored object', () => {
    localStorage.setItem('s', '{"mode":"dark","size":3}')
    const def = persistentState('s', { default: { mode: 'light' as const, size: 1 }, schema: settings })
    expect(def.get()).toEqual({ mode: 'dark', size: 3 })
  })

  it('rejects a stored object of the wrong shape with zod issues', () => {
    localStorage.setItem('s', '{"mode":"blue","size":0}')
    const onError = vi.fn()
    const def = persistentState('s', { default: { mode: 'light' as const, size: 1 }, schema: settings, onError })
    expect(def.get()).toEqual({ mode: 'light', size: 1 })
    const error = onError.mock.calls[0][0] as PersistentStateError
    expect(error.code).toBe('invalid')
    expect(error.issues?.map((issue) => issue.path)).toEqual([['mode'], ['size']])
    expect(localStorage.getItem('s')).toBe('{"mode":"blue","size":0}')
  })

  it('rejects a raw 0.2.1 string that is not in the enum', () => {
    document.cookie = 'theme=blue; path=/'
    const onError = vi.fn()
    const def = persistentState('theme', {
      default: 'light',
      storage: 'cookie',
      schema: z.enum(['light', 'dark']),
      onError,
    })
    expect(def.get()).toBe('light')
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'invalid' }))
  })
})

describe('schema validation in readCookieState', () => {
  it('yields the default and reports invalid', () => {
    const onError = vi.fn()
    const def = persistentState('k', { default: 1, storage: 'cookie', schema: positive, onError })
    expect(readCookieState(def, 'k=-5')).toBe(1)
    expect(readCookieState(def, 'k=4')).toBe(4)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'invalid' }))
  })

  it('yields the default and reports invalid when validate returns nothing, without throwing', () => {
    const onError = vi.fn()
    const broken = schemaOf<number>(() => undefined as unknown as StandardSchemaV1.Result<number>)
    const def = persistentState('k', { default: 1, storage: 'cookie', schema: broken, onError })
    expect(readCookieState(def, 'k=4')).toBe(1)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'invalid' }))
  })
})
