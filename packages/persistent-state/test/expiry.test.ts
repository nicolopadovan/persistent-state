import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { persistentState, type StorageKind } from '@nicolopadovan/persistent-state'
import { freshPage, getRaw, putRaw, resetEnvironment, spyOnWrites } from './helpers'

const WEB_STORAGES: StorageKind[] = ['localStorage', 'sessionStorage']
const DAY_MS = 864e5
const START = Date.parse('2026-01-01T00:00:00Z')

const envelope = (v: unknown, ver: number | undefined, exp: number): string => JSON.stringify({ __ps: 1, v, ver, exp })

beforeEach(() => {
  resetEnvironment()
  vi.useFakeTimers({ now: START, toFake: ['Date'] })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe.each(WEB_STORAGES)('expiry in %s', (storage) => {
  it('writes the expiry as epoch milliseconds, counting a number as days from the write', () => {
    persistentState('k', { default: 0, storage, expires: 2 }).set(1)
    expect(getRaw(storage, 'k')).toBe(`{"__ps":1,"v":1,"exp":${START + 2 * DAY_MS}}`)
  })

  it('counts fractions of a day', () => {
    persistentState('k', { default: 0, storage, expires: 0.5 }).set(1)
    expect(getRaw(storage, 'k')).toBe(`{"__ps":1,"v":1,"exp":${START + DAY_MS / 2}}`)
  })

  it('recomputes the expiry on every write', () => {
    const def = persistentState('k', { default: 0, storage, expires: 2 })
    def.set(1)
    vi.setSystemTime(START + 5 * DAY_MS)
    def.set(2)
    expect(getRaw(storage, 'k')).toBe(`{"__ps":1,"v":2,"exp":${START + 7 * DAY_MS}}`)
  })

  it('uses a Date as the absolute expiry', () => {
    const expires = new Date('2030-06-01T00:00:00Z')
    const def = persistentState('k', { default: 0, storage, expires })
    def.set(1)
    vi.setSystemTime(START + 400 * DAY_MS)
    def.set(2)
    expect(getRaw(storage, 'k')).toBe(`{"__ps":1,"v":2,"exp":${expires.getTime()}}`)
  })

  it('stores a plain value for expires: 0, which sets no expiry', () => {
    persistentState('k', { default: 0, storage, expires: 0 }).set(1)
    expect(getRaw(storage, 'k')).toBe('1')
  })

  it('puts the version before the expiry in the envelope', () => {
    persistentState('k', { default: 0, storage, expires: 1, version: 3, migrate: () => 0 }).set(1)
    expect(getRaw(storage, 'k')).toBe(`{"__ps":1,"v":1,"ver":3,"exp":${START + DAY_MS}}`)
  })

  it('reads a value before its expiry', () => {
    persistentState('k', { default: 0, storage, expires: 2 }).set(1)
    vi.setSystemTime(START + 2 * DAY_MS - 1)
    freshPage()
    const onError = vi.fn()
    expect(persistentState('k', { default: 0, storage, expires: 2, onError }).get()).toBe(1)
    expect(onError).not.toHaveBeenCalled()
  })

  it('yields the default for an expired value and removes the item', () => {
    persistentState('k', { default: 0, storage, expires: 2 }).set(1)
    vi.setSystemTime(START + 2 * DAY_MS + 1)
    freshPage()
    const onError = vi.fn()
    const def = persistentState('k', { default: 0, storage, expires: 2, onError })
    expect(def.get()).toBe(0)
    expect(getRaw(storage, 'k')).toBeNull()
    expect(def.isPersistent()).toBe(true)
    expect(onError).not.toHaveBeenCalled()
  })

  it('removes an expired item for a definition that sets no expiry itself', () => {
    putRaw(storage, 'k', envelope('dark', undefined, START - 1))
    expect(persistentState('k', { default: 'light', storage }).get()).toBe('light')
    expect(getRaw(storage, 'k')).toBeNull()
  })

  it('does not migrate an expired value', () => {
    putRaw(storage, 'k', envelope('dark', 1, START - 1))
    const migrate = vi.fn(String)
    expect(persistentState('k', { default: 'light', storage, version: 2, migrate }).get()).toBe('light')
    expect(migrate).not.toHaveBeenCalled()
    expect(getRaw(storage, 'k')).toBeNull()
  })

  it('stores a new value after an expired one was dropped', () => {
    putRaw(storage, 'k', envelope('dark', undefined, START - 1))
    const def = persistentState('k', { default: 'light', storage, expires: 1 })
    def.get()
    def.set('dim')
    expect(getRaw(storage, 'k')).toBe(`{"__ps":1,"v":"dim","exp":${START + DAY_MS}}`)
  })

  it('never expires a plain value written before the expiry was configured', () => {
    putRaw(storage, 'k', '"dark"')
    vi.setSystemTime(START + 1000 * DAY_MS)
    const writes = spyOnWrites(storage, 'k')
    expect(persistentState('k', { default: 'light', storage, expires: 1 }).get()).toBe('dark')
    expect(writes()).toBe(0)
    expect(getRaw(storage, 'k')).toBe('"dark"')
  })

  it('leaves an expired item of a newer version in place and reports version-ahead', () => {
    const text = envelope({ mode: 'dark' }, 3, START - 1000)
    putRaw(storage, 'k', text)
    const writes = spyOnWrites(storage, 'k')
    const onError = vi.fn()
    const def = persistentState('k', {
      default: { mode: 'light' },
      storage,
      version: 2,
      migrate: () => ({ mode: 'x' }),
      onError,
    })
    expect(def.get()).toEqual({ mode: 'light' })
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'version-ahead' }))
    expect(writes()).toBe(0)
    expect(getRaw(storage, 'k')).toBe(text)
  })

  it('migrates an unexpired older envelope and gives the written-back item a fresh expiry', () => {
    putRaw(storage, 'k', envelope('dark', 1, START + DAY_MS))
    vi.setSystemTime(START + DAY_MS / 2)
    const def = persistentState('k', {
      default: { mode: 'light' },
      storage,
      version: 2,
      expires: 3,
      migrate: (stored) => ({ mode: String(stored) }),
    })
    expect(def.get()).toEqual({ mode: 'dark' })
    expect(getRaw(storage, 'k')).toBe(`{"__ps":1,"v":{"mode":"dark"},"ver":2,"exp":${START + DAY_MS / 2 + 3 * DAY_MS}}`)
  })
})

describe('expiry and cookies', () => {
  it('leaves cookie expiry to the cookie attribute and stores a plain value', () => {
    persistentState('k', { default: 0, storage: 'cookie', expires: 2 }).set(1)
    expect(getRaw('cookie', 'k')).toBe('1')
  })
})

describe('invalid expiry', () => {
  it.each([-1, Number.NaN, Infinity])('rejects expires: %s for every storage', (expires) => {
    for (const storage of ['localStorage', 'sessionStorage', 'cookie'] as const) {
      expect(() => persistentState('k', { default: 0, storage, expires })).toThrow(TypeError)
    }
  })

  it('rejects an invalid Date', () => {
    expect(() => persistentState('k', { default: 0, expires: new Date('nope') })).toThrow(TypeError)
    expect(() => persistentState('k', { default: 0, storage: 'cookie', expires: new Date('nope') })).toThrow(TypeError)
  })
})
