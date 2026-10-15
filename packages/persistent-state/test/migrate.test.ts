import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  persistentState,
  readCookieState,
  type StandardSchemaV1,
  type StorageKind,
} from '@nicolopadovan/persistent-state'
import { freshPage, getRaw, putRaw, resetEnvironment, spyOnWrites } from './helpers'

const STORAGES: StorageKind[] = ['localStorage', 'sessionStorage', 'cookie']

interface Settings {
  mode: string
}

const DEFAULT: Settings = { mode: 'light' }

const upgrade = (stored: unknown, from: number): Settings =>
  from === 0 ? { mode: String(stored) } : { mode: (stored as { theme: string }).theme }

const envelope = (v: unknown, ver?: number, exp?: number): string => JSON.stringify({ __ps: 1, v, ver, exp })

const modeSchema: StandardSchemaV1<unknown, Settings> = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: (value) =>
      typeof (value as Settings | undefined)?.mode === 'string' && (value as Settings).mode !== 'invalid'
        ? { value: value as Settings }
        : { issues: [{ message: 'bad mode' }] },
  },
}

beforeEach(resetEnvironment)
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('the definition options', () => {
  it('throws a TypeError for a version without migrate', () => {
    expect(() => persistentState('k', { default: 0, version: 2 })).toThrow(TypeError)
    expect(() => persistentState('k', { default: 0, version: 2 })).toThrow(/migrate/)
  })

  it.each([0, -1, 1.5, Number.NaN, Infinity])('throws a TypeError for the version %s', (version) => {
    expect(() => persistentState('k', { default: 0, version, migrate: (stored) => stored as number })).toThrow(
      TypeError,
    )
  })

  it('throws a TypeError for a migrate without a version', () => {
    expect(() => persistentState('k', { default: 0, migrate: (stored) => stored as number })).toThrow(TypeError)
    expect(() => persistentState('k', { default: 0, migrate: (stored) => stored as number })).toThrow(/version/)
  })

  it('accepts a version with migrate', () => {
    expect(() => persistentState('k', { default: 0, version: 1, migrate: (stored) => stored as number })).not.toThrow()
  })
})

describe.each(STORAGES)('stored format in %s', (storage) => {
  it('writes an envelope with the version once a version is set', () => {
    persistentState('k', { default: DEFAULT, storage, version: 2, migrate: upgrade }).set({ mode: 'dark' })
    expect(getRaw(storage, 'k')).toBe('{"__ps":1,"v":{"mode":"dark"},"ver":2}')
  })

  it('reads back what it wrote without migrating', () => {
    const migrate = vi.fn(upgrade)
    persistentState('k', { default: DEFAULT, storage, version: 2, migrate }).set({ mode: 'dark' })
    freshPage()
    const def = persistentState('k', { default: DEFAULT, storage, version: 2, migrate })
    expect(def.get()).toEqual({ mode: 'dark' })
    expect(migrate).not.toHaveBeenCalled()
  })

  it('reads an envelope of a string default as the envelope, not as raw text', () => {
    putRaw(storage, 'k', envelope('dark', 1))
    const def = persistentState('k', { default: 'light', storage, version: 1, migrate: String })
    expect(def.get()).toBe('dark')
  })

  it('reads an envelope without a version as version 0', () => {
    putRaw(storage, 'k', envelope('dark'))
    const migrate = vi.fn(upgrade)
    expect(persistentState('k', { default: DEFAULT, storage, version: 2, migrate }).get()).toEqual({
      mode: 'dark',
    })
    expect(migrate).toHaveBeenCalledWith('dark', 0)
  })

  it('unwraps an envelope for a definition that no longer sets a version', () => {
    putRaw(storage, 'k', envelope('dark'))
    expect(persistentState('k', { default: 'light', storage }).get()).toBe('dark')
  })

  it('keeps the serialized text of a custom serializer in the envelope', () => {
    const serializer = { serialize: (v: number) => `n:${v}`, deserialize: (t: string) => Number(t.slice(2)) }
    const migrate = vi.fn((stored: unknown, from: number) => (stored as number) + from)
    persistentState('k', { default: 0, storage, serializer, version: 2, migrate }).set(5)
    expect(getRaw(storage, 'k')).toBe('{"__ps":1,"v":"n:5","ver":2}')
    freshPage()
    expect(persistentState('k', { default: 0, storage, serializer, version: 2, migrate }).get()).toBe(5)
    expect(migrate).not.toHaveBeenCalled()
  })
})

describe.each(STORAGES)('migrating in %s', (storage) => {
  const define = (options: { migrate?: (stored: unknown, from: number) => Settings; onError?: () => void } = {}) =>
    persistentState('k', {
      default: DEFAULT,
      storage,
      version: 2,
      migrate: options.migrate ?? upgrade,
      onError: options.onError ?? (() => {}),
    })

  it('reads a plain 0.2.1 value as version 0, migrates it and writes it back once', () => {
    putRaw(storage, 'k', '"dark"')
    const migrate = vi.fn(upgrade)
    const def = define({ migrate })
    expect(def.get()).toEqual({ mode: 'dark' })
    expect(def.get()).toEqual({ mode: 'dark' })
    expect(migrate).toHaveBeenCalledTimes(1)
    expect(migrate).toHaveBeenCalledWith('dark', 0)
    expect(getRaw(storage, 'k')).toBe('{"__ps":1,"v":{"mode":"dark"},"ver":2}')
  })

  it('reads a raw 0.2.1 string as version 0', () => {
    putRaw(storage, 'k', 'dark')
    const migrate = vi.fn(upgrade)
    expect(define({ migrate }).get()).toEqual({ mode: 'dark' })
    expect(migrate).toHaveBeenCalledWith('dark', 0)
  })

  it('does not migrate the same item again on the next page', () => {
    putRaw(storage, 'k', '"dark"')
    define().get()
    freshPage()
    const migrate = vi.fn(upgrade)
    expect(define({ migrate }).get()).toEqual({ mode: 'dark' })
    expect(migrate).not.toHaveBeenCalled()
  })

  it('migrates once for every definition that shares the key', () => {
    putRaw(storage, 'k', '"dark"')
    const migrate = vi.fn(upgrade)
    const a = define({ migrate })
    const b = define({ migrate })
    expect([a.get(), b.get()]).toEqual([{ mode: 'dark' }, { mode: 'dark' }])
    expect(migrate).toHaveBeenCalledTimes(1)
  })

  it('passes the stored version of an older envelope to migrate', () => {
    putRaw(storage, 'k', envelope({ theme: 'dark' }, 1))
    const migrate = vi.fn(upgrade)
    expect(define({ migrate }).get()).toEqual({ mode: 'dark' })
    expect(migrate).toHaveBeenCalledWith({ theme: 'dark' }, 1)
    expect(getRaw(storage, 'k')).toBe('{"__ps":1,"v":{"mode":"dark"},"ver":2}')
  })

  it('neither migrates nor writes an item that is already at the current version', () => {
    putRaw(storage, 'k', envelope({ mode: 'dark' }, 2))
    const writes = spyOnWrites(storage, 'k')
    const migrate = vi.fn(upgrade)
    expect(define({ migrate }).get()).toEqual({ mode: 'dark' })
    expect(migrate).not.toHaveBeenCalled()
    expect(writes()).toBe(0)
  })

  it('does not migrate or write when nothing is stored', () => {
    const writes = spyOnWrites(storage, 'k')
    const migrate = vi.fn(upgrade)
    expect(define({ migrate }).get()).toEqual(DEFAULT)
    expect(migrate).not.toHaveBeenCalled()
    expect(writes()).toBe(0)
    expect(getRaw(storage, 'k')).toBeNull()
  })

  it('validates the migrated value and writes back what the schema returns', () => {
    putRaw(storage, 'k', '"dark"')
    const upper: StandardSchemaV1<unknown, Settings> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: (value) => ({ value: { mode: (value as Settings).mode.toUpperCase() } }),
      },
    }
    const def = persistentState('k', {
      default: DEFAULT,
      storage,
      version: 2,
      migrate: upgrade,
      schema: upper,
    })
    expect(def.get()).toEqual({ mode: 'DARK' })
    expect(getRaw(storage, 'k')).toBe('{"__ps":1,"v":{"mode":"DARK"},"ver":2}')
  })

  it('yields the default when the migrated value is invalid, and leaves the old item untouched', () => {
    putRaw(storage, 'k', '"invalid"')
    const writes = spyOnWrites(storage, 'k')
    const onError = vi.fn()
    const def = persistentState('k', {
      default: DEFAULT,
      storage,
      version: 2,
      migrate: upgrade,
      schema: modeSchema,
      onError,
    })
    expect(def.get()).toEqual(DEFAULT)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'invalid' }))
    expect(writes()).toBe(0)
    expect(getRaw(storage, 'k')).toBe('"invalid"')
  })

  it('reports migrate-failed with the cause and yields the default', () => {
    putRaw(storage, 'k', '"dark"')
    const cause = new Error('cannot upgrade')
    const onError = vi.fn()
    const def = define({
      migrate: () => {
        throw cause
      },
      onError,
    })
    expect(def.get()).toEqual(DEFAULT)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'migrate-failed', key: 'k', cause }))
  })

  it.each([
    ['a plain value', '"dark"'],
    ['an envelope', envelope({ theme: 'dark' }, 1)],
  ])('keeps the stored data when migrating %s fails', (_, text) => {
    putRaw(storage, 'k', text)
    const writes = spyOnWrites(storage, 'k')
    const def = define({
      migrate: () => {
        throw new Error('cannot upgrade')
      },
    })
    def.get()
    expect(writes()).toBe(0)
    expect(getRaw(storage, 'k')).toBe(text)
    expect(def.isPersistent()).toBe(true)
  })

  it.each([
    ['a plain value', '"dark"'],
    ['an envelope', envelope({ theme: 'dark' }, 1)],
  ])('reports migrate-failed and keeps the data when migrating %s returns undefined', (_, text) => {
    putRaw(storage, 'k', text)
    const writes = spyOnWrites(storage, 'k')
    const onError = vi.fn()
    const def = define({ migrate: () => undefined as unknown as Settings, onError })
    expect(def.get()).toEqual(DEFAULT)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'migrate-failed', key: 'k' }))
    expect(writes()).toBe(0)
    expect(getRaw(storage, 'k')).toBe(text)
    expect(def.isPersistent()).toBe(true)
  })

  it('tries the migration again on the next page after it failed', () => {
    putRaw(storage, 'k', '"dark"')
    define({
      migrate: () => {
        throw new Error('cannot upgrade')
      },
    }).get()
    freshPage()
    expect(define().get()).toEqual({ mode: 'dark' })
    expect(getRaw(storage, 'k')).toBe('{"__ps":1,"v":{"mode":"dark"},"ver":2}')
  })

  it('keeps the migrated value in memory when the write-back fails', () => {
    putRaw(storage, 'k', '"dark"')
    const onError = vi.fn()
    const blocked =
      storage === 'cookie'
        ? vi.spyOn(Document.prototype, 'cookie', 'set').mockImplementation(() => {})
        : vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key) => {
            if (key === 'k') throw new DOMException('full', 'QuotaExceededError')
          })
    const def = define({ onError })
    expect(def.get()).toEqual({ mode: 'dark' })
    expect(def.isPersistent()).toBe(false)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'write-failed' }))
    blocked.mockRestore()
    expect(getRaw(storage, 'k')).toBe('"dark"')
  })

  it('does not run migrate or the schema on malformed envelopes, and reports parse-failed', () => {
    const malformed = [
      '{"__ps":1}',
      '{"__ps":1,"v":1,"ver":-1}',
      '{"__ps":1,"v":1,"ver":1.5}',
      '{"__ps":1,"v":1,"ver":"2"}',
      '{"__ps":1,"v":1,"exp":"soon"}',
    ]
    for (const text of malformed) {
      freshPage()
      putRaw(storage, 'k', text)
      const writes = spyOnWrites(storage, 'k')
      const migrate = vi.fn(upgrade)
      const onError = vi.fn()
      const def = persistentState('k', {
        default: DEFAULT,
        storage,
        version: 2,
        migrate,
        schema: modeSchema,
        onError,
      })
      expect(def.get()).toEqual(DEFAULT)
      expect(onError).toHaveBeenCalledTimes(1)
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'parse-failed', key: 'k' }))
      expect(migrate).not.toHaveBeenCalled()
      expect(writes()).toBe(0)
      expect(getRaw(storage, 'k')).toBe(text)
      vi.restoreAllMocks()
    }
  })

  it('reports parse-failed when a custom serializer cannot read the envelope payload', () => {
    putRaw(storage, 'k', envelope(42, 2))
    const onError = vi.fn()
    const serializer = { serialize: String, deserialize: (text: string) => text.toUpperCase() }
    const def = persistentState('k', {
      default: 'x',
      storage,
      serializer,
      version: 2,
      migrate: String,
      onError,
    })
    expect(def.get()).toBe('x')
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'parse-failed' }))
    expect(getRaw(storage, 'k')).toBe(envelope(42, 2))
  })
})

describe.each(STORAGES)('a stored version newer than the code in %s', (storage) => {
  const NEWER = envelope({ mode: 'dark', extra: true }, 3)
  const define = (options: { onError?: () => void; migrate?: typeof upgrade; schema?: typeof modeSchema } = {}) =>
    persistentState('k', {
      default: DEFAULT,
      storage,
      version: 2,
      migrate: options.migrate ?? upgrade,
      schema: options.schema ?? modeSchema,
      onError: options.onError ?? (() => {}),
    })

  it('yields the default and reports version-ahead', () => {
    putRaw(storage, 'k', NEWER)
    const onError = vi.fn()
    expect(define({ onError }).get()).toEqual(DEFAULT)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'version-ahead', key: 'k' }))
  })

  it('never writes, removes, migrates or validates the item while reading', () => {
    putRaw(storage, 'k', NEWER)
    const writes = spyOnWrites(storage, 'k')
    const migrate = vi.fn(upgrade)
    const validate = vi.fn(modeSchema['~standard'].validate)
    const def = define({ migrate, schema: { '~standard': { ...modeSchema['~standard'], validate } } })
    def.get()
    expect(writes()).toBe(0)
    expect(migrate).not.toHaveBeenCalled()
    expect(validate).not.toHaveBeenCalled()
    expect(getRaw(storage, 'k')).toBe(NEWER)
    expect(def.isPersistent()).toBe(true)
  })

  it('leaves the item alone on the next page too', () => {
    putRaw(storage, 'k', NEWER)
    define().get()
    freshPage()
    define().get()
    expect(getRaw(storage, 'k')).toBe(NEWER)
  })

  it('applies to a definition that sets no version, whose version is 0', () => {
    putRaw(storage, 'k', envelope('dark', 1))
    const onError = vi.fn()
    const writes = spyOnWrites(storage, 'k')
    expect(persistentState('k', { default: 'light', storage, onError }).get()).toBe('light')
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'version-ahead' }))
    expect(writes()).toBe(0)
    expect(getRaw(storage, 'k')).toBe(envelope('dark', 1))
  })

  it('is replaced only by an explicit set', () => {
    putRaw(storage, 'k', NEWER)
    const def = define()
    def.get()
    def.set({ mode: 'dark' })
    expect(getRaw(storage, 'k')).toBe('{"__ps":1,"v":{"mode":"dark"},"ver":2}')
  })
})

describe.each(STORAGES)('an envelope of another format in %s', (storage) => {
  it.each([
    ['2', '{"__ps":2,"v":{"mode":"dark"},"ver":1}'],
    ['"1"', '{"__ps":"1","v":{"mode":"dark"}}'],
    ['null', '{"__ps":null,"v":{"mode":"dark"}}'],
  ])('treats __ps: %s as written by newer code', (_, text) => {
    putRaw(storage, 'k', text)
    const writes = spyOnWrites(storage, 'k')
    const onError = vi.fn()
    const migrate = vi.fn(upgrade)
    const versioned = persistentState('k', {
      default: DEFAULT,
      storage,
      version: 2,
      migrate,
      schema: modeSchema,
      onError,
    })
    expect(versioned.get()).toEqual(DEFAULT)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'version-ahead', key: 'k' }))
    expect(migrate).not.toHaveBeenCalled()
    expect(writes()).toBe(0)
    expect(getRaw(storage, 'k')).toBe(text)
  })

  it('applies to a definition without a version and to a string default', () => {
    putRaw(storage, 'k', '{"__ps":2,"v":"dark"}')
    const writes = spyOnWrites(storage, 'k')
    const onError = vi.fn()
    expect(persistentState('k', { default: 'light', storage, onError }).get()).toBe('light')
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'version-ahead' }))
    expect(writes()).toBe(0)
    expect(getRaw(storage, 'k')).toBe('{"__ps":2,"v":"dark"}')
  })

  it('applies with a custom serializer', () => {
    putRaw(storage, 'k', '{"__ps":2,"v":"n:5"}')
    const onError = vi.fn()
    const serializer = {
      serialize: (value: number) => `n:${value}`,
      deserialize: (text: string) => Number(text.slice(2)),
    }
    expect(persistentState('k', { default: 1, storage, serializer, onError }).get()).toBe(1)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'version-ahead' }))
    expect(getRaw(storage, 'k')).toBe('{"__ps":2,"v":"n:5"}')
  })
})

describe.each(STORAGES)('replacing or removing an item the reads left untouched in %s', (storage) => {
  const failing = (): never => {
    throw new Error('cannot upgrade')
  }
  const define = (onError = () => {}) =>
    persistentState('k', {
      default: DEFAULT,
      storage,
      version: 2,
      migrate: upgrade,
      schema: modeSchema,
      onError,
    })

  const items: [string, string, ReturnType<typeof define>][] = [
    ['a newer version', envelope({ mode: 'dark' }, 3), define()],
    ['an invalid value', envelope({ mode: 'invalid' }, 2), define()],
    [
      'a failed migration',
      '"dark"',
      persistentState('k', { default: DEFAULT, storage, version: 2, migrate: failing, onError: () => {} }),
    ],
  ]

  it.each(items)('reset() removes %s', (_, text, def) => {
    putRaw(storage, 'k', text)
    expect(def.get()).toEqual(DEFAULT)
    expect(getRaw(storage, 'k')).toBe(text)
    def.reset()
    expect(getRaw(storage, 'k')).toBeNull()
  })

  it.each(items)('set() replaces %s', (_, text, def) => {
    putRaw(storage, 'k', text)
    expect(def.get()).toEqual(DEFAULT)
    def.set({ mode: 'dim' })
    expect(getRaw(storage, 'k')).toBe('{"__ps":1,"v":{"mode":"dim"},"ver":2}')
  })
})

describe('readCookieState', () => {
  const cookieDef = (options: { onError?: () => void; schema?: typeof modeSchema } = {}) =>
    persistentState('k', {
      default: DEFAULT,
      storage: 'cookie',
      version: 2,
      migrate: upgrade,
      onError: options.onError ?? (() => {}),
      schema: options.schema ?? modeSchema,
    })

  it('migrates a plain value and an older envelope without writing back', () => {
    const writes = spyOnWrites('cookie', 'k')
    const def = cookieDef()
    expect(readCookieState(def, `k=${encodeURIComponent('"dark"')}`)).toEqual({ mode: 'dark' })
    expect(readCookieState(def, `k=${encodeURIComponent(envelope({ theme: 'dark' }, 1))}`)).toEqual({ mode: 'dark' })
    expect(writes()).toBe(0)
    expect(document.cookie).toBe('')
  })

  it('reads a current envelope', () => {
    expect(readCookieState(cookieDef(), `k=${encodeURIComponent(envelope({ mode: 'dark' }, 2))}`)).toEqual({
      mode: 'dark',
    })
  })

  it('validates the migrated value', () => {
    const onError = vi.fn()
    const def = cookieDef({ onError, schema: modeSchema })
    expect(readCookieState(def, `k=${encodeURIComponent('"invalid"')}`)).toEqual(DEFAULT)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'invalid' }))
  })

  it('reads a newer version as the default and reports it', () => {
    const onError = vi.fn()
    expect(readCookieState(cookieDef({ onError }), `k=${encodeURIComponent(envelope({ mode: 'dark' }, 3))}`)).toEqual(
      DEFAULT,
    )
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'version-ahead', key: 'k' }))
  })

  it('reports migrate-failed and yields the default', () => {
    const onError = vi.fn()
    const def = persistentState('k', {
      default: DEFAULT,
      storage: 'cookie',
      version: 2,
      migrate: () => {
        throw new Error('no')
      },
      onError,
    })
    expect(readCookieState(def, `k=${encodeURIComponent('"dark"')}`)).toEqual(DEFAULT)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'migrate-failed' }))
  })
})
