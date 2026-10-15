import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  persistentState,
  PersistentStateError,
  refreshConsent,
  type StorageKind,
} from '@nicolopadovan/persistent-state'
import { freshPage, resetEnvironment } from './helpers'

const STORAGES: StorageKind[] = ['localStorage', 'sessionStorage', 'cookie']

beforeEach(resetEnvironment)
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('stored values', () => {
  describe.each(STORAGES)('%s', (storage) => {
    it.each(['42', 'true', 'null', ''])('round-trips the string %j as a string', (value) => {
      persistentState('k', { default: 'fallback', storage, onError: () => {} }).set(value)
      freshPage()
      expect(persistentState('k', { default: 'fallback', storage }).get()).toBe(value)
    })

    it('reads a raw 42 written by 0.2.1 as the string "42" when the default is a string', () => {
      if (storage === 'cookie') document.cookie = 'k=42; path=/'
      else window[storage].setItem('k', '42')
      expect(persistentState('k', { default: 'x', storage }).get()).toBe('42')
    })

    it('round-trips objects and numbers as JSON', () => {
      persistentState('o', { default: { n: 0 }, storage }).set({ n: 1 })
      persistentState('n', { default: 0, storage }).set(7)
      freshPage()
      expect(persistentState('o', { default: { n: 0 }, storage }).get()).toEqual({ n: 1 })
      expect(persistentState('n', { default: 0, storage }).get()).toBe(7)
    })
  })

  it('stores strings with their JSON quotes', () => {
    persistentState('k', { default: '' }).set('42')
    expect(localStorage.getItem('k')).toBe('"42"')
  })

  it('reads 0.2.1 raw Web Storage strings and JSON values', () => {
    localStorage.setItem('theme', 'dark')
    localStorage.setItem('count', '3')
    localStorage.setItem('flags', '{"a":true}')
    sessionStorage.setItem('tab', 'settings')
    expect(persistentState('theme', { default: 'light' }).get()).toBe('dark')
    expect(persistentState('count', { default: 0 }).get()).toBe(3)
    expect(persistentState('flags', { default: { a: false } }).get()).toEqual({ a: true })
    expect(persistentState('tab', { default: 'home', storage: 'sessionStorage' }).get()).toBe('settings')
  })

  it('returns the default when nothing is stored', () => {
    expect(persistentState('missing', { default: 5 }).get()).toBe(5)
  })

  it('caches the first read so objects keep their identity', () => {
    localStorage.setItem('o', '{"a":1}')
    const def = persistentState('o', { default: {} })
    expect(def.get()).toBe(def.get())
  })

  it('uses a custom serializer for both directions', () => {
    const serializer = { serialize: (v: number) => `n:${v}`, deserialize: (t: string) => Number(t.slice(2)) }
    persistentState('s', { default: 0, serializer }).set(4)
    expect(localStorage.getItem('s')).toBe('n:4')
    freshPage()
    expect(persistentState('s', { default: 0, serializer }).get()).toBe(4)
  })

  it('reports parse-failed and uses the default when deserialize throws', () => {
    localStorage.setItem('s', 'broken')
    const onError = vi.fn()
    const serializer = {
      serialize: String,
      deserialize: () => {
        throw new Error('bad')
      },
    }
    expect(persistentState('s', { default: 1, serializer, onError }).get()).toBe(1)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'parse-failed', key: 's' }))
  })
})

describe('definitions', () => {
  it('throws a TypeError for an empty key', () => {
    expect(() => persistentState('', { default: 1 })).toThrow(TypeError)
  })

  it('accepts cookie attributes only for cookie storage', () => {
    // @ts-expect-error path is a cookie attribute
    persistentState('a', { default: 0, path: '/' })
    // @ts-expect-error sameSite is a cookie attribute
    persistentState('b', { default: 0, storage: 'sessionStorage', sameSite: 'lax' })
    const cookie = persistentState('c', { default: 0, storage: 'cookie', path: '/', expires: 7 })
    expect(cookie.storage).toBe('cookie')
  })

  it('exposes the full key, the storage and the default', () => {
    const def = persistentState('k', { default: 1, namespace: 'app', storage: 'sessionStorage' })
    expect([def.key, def.storage, def.defaultValue]).toEqual(['app:k', 'sessionStorage', 1])
  })

  it('stores under namespace:key', () => {
    persistentState('k', { default: 0, namespace: 'app' }).set(1)
    expect(localStorage.getItem('app:k')).toBe('1')
    expect(localStorage.getItem('k')).toBeNull()
  })

  it('keeps two definitions with the same storage and full key in sync', () => {
    const a = persistentState('shared', { default: 0, namespace: 'n' })
    const b = persistentState('n:shared', { default: 0 })
    const listener = vi.fn()
    b.subscribe(listener)
    a.set(3)
    expect(b.get()).toBe(3)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('keeps the same key in different storages apart', () => {
    persistentState('k', { default: 0 }).set(1)
    expect(persistentState('k', { default: 0, storage: 'sessionStorage' }).get()).toBe(0)
  })

  it('applies an updater to the previous value', () => {
    const def = persistentState('n', { default: 1 })
    def.set((n) => n + 1)
    def.set((n) => n * 10)
    expect(def.get()).toBe(20)
  })

  it('does nothing for an Object.is-equal value', () => {
    const def = persistentState('n', { default: 1 })
    const listener = vi.fn()
    def.subscribe(listener)
    def.get()
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    def.set(1)
    expect(listener).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
  })

  it('stops notifying after unsubscribe', () => {
    const def = persistentState('n', { default: 1 })
    const listener = vi.fn()
    def.subscribe(listener)()
    def.set(2)
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('reset', () => {
  it.each(['localStorage', 'sessionStorage'] as const)(
    'removes the %s item and notifies every subscriber',
    (storage) => {
      const a = persistentState('k', { default: 'd', storage })
      const b = persistentState('k', { default: 'd', storage })
      a.set('v')
      const listeners = [vi.fn(), vi.fn()]
      a.subscribe(listeners[0])
      b.subscribe(listeners[1])
      b.reset()
      expect(window[storage].getItem('k')).toBeNull()
      expect([a.get(), b.get()]).toEqual(['d', 'd'])
      listeners.forEach((listener) => expect(listener).toHaveBeenCalledTimes(1))
    },
  )

  it('removes the cookie under every legacy name variant', () => {
    document.cookie = 'my:key=1; path=/'
    document.cookie = 'my%253Akey=2; path=/'
    document.cookie = 'other=3; path=/'
    const def = persistentState('my:key', { default: 0, storage: 'cookie' })
    def.set(4)
    expect(document.cookie).toContain('my%3Akey=4')
    def.reset()
    expect(document.cookie).toBe('other=3')
    expect(def.get()).toBe(0)
  })

  it('removes before the value was ever read', () => {
    localStorage.setItem('k', '"stored"')
    persistentState('k', { default: 'd' }).reset()
    expect(localStorage.getItem('k')).toBeNull()
  })

  it('reads and removes values in a full Web Storage', () => {
    localStorage.setItem('k', '"dark"')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    const onError = vi.fn()
    const def = persistentState('k', { default: 'light', onError })
    expect(def.get()).toBe('dark')
    expect(def.isPersistent()).toBe(true)
    def.reset()
    expect(localStorage.getItem('k')).toBeNull()
    expect(onError).not.toHaveBeenCalled()
  })

  it('reports unavailable when it is the first use and storage is blocked', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    const onError = vi.fn()
    const def = persistentState('k', { default: 1, onError })
    def.reset()
    expect(def.isPersistent()).toBe(false)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'unavailable' }))
  })

  it('cannot remove other cookies through the key', () => {
    document.cookie = 'a=1; path=/'
    persistentState('a=b; c', { default: 0, storage: 'cookie' }).reset()
    expect(document.cookie).toBe('a=1')
  })

  it('cancels a pending debounced write', () => {
    vi.useFakeTimers()
    const def = persistentState('k', { default: 0, debounceMs: 100 })
    def.set(1)
    def.reset()
    vi.advanceTimersByTime(200)
    expect(localStorage.getItem('k')).toBeNull()
  })

  it('is what setting undefined does', () => {
    const def = persistentState<number | undefined>('k', { default: 1 })
    def.set(2)
    def.set(undefined)
    expect(localStorage.getItem('k')).toBeNull()
    expect(def.get()).toBe(1)
  })
})

describe('cookies', () => {
  it('writes js-cookie encoded names and values with the default attributes', () => {
    const writes: string[] = []
    vi.spyOn(Document.prototype, 'cookie', 'set').mockImplementation((value: string) => void writes.push(value))
    vi.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z'), toFake: ['Date'] })
    persistentState('a b+c(d)', { default: {}, storage: 'cookie', onError: () => {} }).set({ a: 'x;y' })
    expect(writes).toEqual([
      'a%20b+c%28d%29={%22a%22:%22x%3By%22}; path=/; expires=Fri, 01 Jan 2027 00:00:00 GMT; samesite=lax',
    ])
  })

  it('applies the cookie options and counts a number of expiry days from each write', () => {
    const writes: string[] = []
    vi.spyOn(Document.prototype, 'cookie', 'set').mockImplementation((value: string) => void writes.push(value))
    vi.useFakeTimers({ now: new Date('2026-01-01T00:00:00Z'), toFake: ['Date'] })
    const def = persistentState('k', {
      default: 0,
      storage: 'cookie',
      expires: 2,
      path: '/app; evil=1',
      domain: 'example.com',
      secure: true,
      sameSite: 'strict',
      onError: () => {},
    })
    def.set(1)
    vi.setSystemTime(new Date('2026-01-05T00:00:00Z'))
    def.set(2)
    expect(writes).toEqual([
      'k=1; path=/app; expires=Sat, 03 Jan 2026 00:00:00 GMT; samesite=strict; domain=example.com; secure',
      'k=2; path=/app; expires=Wed, 07 Jan 2026 00:00:00 GMT; samesite=strict; domain=example.com; secure',
    ])
  })

  it('writes a session cookie for expires: 0', () => {
    const writes: string[] = []
    vi.spyOn(Document.prototype, 'cookie', 'set').mockImplementation((value: string) => void writes.push(value))
    persistentState('k', { default: 0, storage: 'cookie', expires: 0, onError: () => {} }).set(1)
    expect(writes).toEqual(['k=1; path=/; samesite=lax'])
  })

  it.each([-1, Number.NaN, Infinity])('rejects expires: %s', (expires) => {
    expect(() => persistentState('k', { default: 0, storage: 'cookie', expires })).toThrow(TypeError)
  })

  it('accepts a fixed expiry date', () => {
    const writes: string[] = []
    vi.spyOn(Document.prototype, 'cookie', 'set').mockImplementation((value: string) => void writes.push(value))
    const expires = new Date('2030-06-01T00:00:00Z')
    persistentState('k', { default: 0, storage: 'cookie', expires, onError: () => {} }).set(1)
    expect(writes[0]).toContain('expires=Sat, 01 Jun 2030 00:00:00 GMT')
  })

  it('encodes keys and values so they cannot inject other cookies', () => {
    persistentState('a=b; c', { default: '', storage: 'cookie' }).set('x; other=1')
    expect(document.cookie).not.toMatch(/(^|; )(a|c|other)=/)
    freshPage()
    expect(persistentState('a=b; c', { default: '', storage: 'cookie' }).get()).toBe('x; other=1')
  })
})

describe('fallback and errors', () => {
  it('keeps a working in-memory value when storage throws, with isPersistent false and unavailable reported once', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    const onError = vi.fn()
    const def = persistentState('k', { default: 1, onError })
    expect(def.get()).toBe(1)
    def.set(2)
    expect(def.get()).toBe(2)
    expect(def.isPersistent()).toBe(false)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0]).toBeInstanceOf(PersistentStateError)
    expect(onError.mock.calls[0][0]).toMatchObject({ code: 'unavailable', key: 'k' })
  })

  it('reports unavailable once per record, not on every later read', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    const gate = { allowed: true }
    const onError = vi.fn()
    const def = persistentState('k', { default: 1, consent: () => gate.allowed, onError })
    def.get()
    gate.allowed = false
    refreshConsent()
    gate.allowed = true
    refreshConsent()
    expect(def.isPersistent()).toBe(false)
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('treats disabled cookies as unavailable', () => {
    vi.spyOn(navigator, 'cookieEnabled', 'get').mockReturnValue(false)
    const onError = vi.fn()
    const def = persistentState('k', { default: 1, storage: 'cookie', onError })
    def.set(2)
    expect([def.get(), def.isPersistent(), document.cookie]).toEqual([2, false, ''])
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'unavailable' }))
  })

  it('reports write-failed on a quota error and recovers on the next successful write', () => {
    const onError = vi.fn()
    const def = persistentState('k', { default: 0, onError })
    const listener = vi.fn()
    def.subscribe(listener)
    def.get()
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    def.set(1)
    expect(def.get()).toBe(1)
    expect(def.isPersistent()).toBe(false)
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'write-failed', cause: expect.any(DOMException) as unknown }),
    )
    setItem.mockRestore()
    def.set(2)
    expect(def.isPersistent()).toBe(true)
    expect(localStorage.getItem('k')).toBe('2')
    expect(listener).toHaveBeenCalledTimes(4)
  })

  it('reports write-failed when a cookie does not read back, and recovers', () => {
    const onError = vi.fn()
    const def = persistentState('k', { default: 0, storage: 'cookie', onError })
    const blocked = vi.spyOn(Document.prototype, 'cookie', 'set').mockImplementation(() => {})
    def.set(1)
    expect([def.get(), def.isPersistent()]).toEqual([1, false])
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'write-failed' }))
    blocked.mockRestore()
    def.set(2)
    expect(def.isPersistent()).toBe(true)
  })

  it('warns with a [persistent-state] prefix by default', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key) => {
      if (key === 'k') throw new Error('full')
    })
    persistentState('k', { default: 0 }).set(1)
    expect(warn).toHaveBeenCalledWith(
      '[persistent-state]',
      expect.stringContaining('"k"'),
      expect.any(PersistentStateError),
    )
  })
})

describe('debounced writes', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('updates memory at once and writes after debounceMs', () => {
    const def = persistentState('k', { default: 0, debounceMs: 100 })
    def.set(1)
    expect(def.get()).toBe(1)
    vi.advanceTimersByTime(99)
    expect(localStorage.getItem('k')).toBeNull()
    vi.advanceTimersByTime(1)
    expect(localStorage.getItem('k')).toBe('1')
  })

  it('restarts the wait on a newer set and writes only the last value', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const def = persistentState('k', { default: 0, debounceMs: 100 })
    def.get()
    setItem.mockClear()
    def.set(1)
    vi.advanceTimersByTime(80)
    def.set(2)
    vi.advanceTimersByTime(80)
    expect(setItem).not.toHaveBeenCalled()
    vi.advanceTimersByTime(20)
    expect(setItem.mock.calls).toEqual([['k', '2']])
  })

  it('flushes on pagehide', () => {
    const def = persistentState('k', { default: 0, debounceMs: 1000 })
    def.set(1)
    window.dispatchEvent(new Event('pagehide'))
    expect(localStorage.getItem('k')).toBe('1')
  })

  it('flushes when the page becomes hidden, not when it becomes visible', () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    const def = persistentState('k', { default: 0, debounceMs: 1000 })
    def.set(1)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(localStorage.getItem('k')).toBeNull()
    visibility.mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(localStorage.getItem('k')).toBe('1')
    vi.advanceTimersByTime(1000)
    expect(localStorage.getItem('k')).toBe('1')
  })

  it('adds no beforeunload listener', () => {
    const add = vi.spyOn(window, 'addEventListener')
    persistentState('k', { default: 0, debounceMs: 10 }).set(1)
    const types = add.mock.calls.map(([type]) => type)
    expect(types).toContain('pagehide')
    expect(types).not.toContain('beforeunload')
  })
})

describe('an onError that throws', () => {
  const boom = new Error('boom')
  const onError = vi.fn(() => {
    throw boom
  })
  const consoleError = () => vi.spyOn(console, 'error').mockImplementation(() => {})

  function expectLoggedOnce(spy: ReturnType<typeof consoleError>): void {
    expect(onError).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith('[persistent-state]', expect.stringContaining('onError'), boom)
  }

  beforeEach(() => {
    onError.mockClear()
  })

  it('does not propagate out of get() reporting unavailable', () => {
    const spy = consoleError()
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    expect(persistentState('k', { default: 1, onError }).get()).toBe(1)
    expectLoggedOnce(spy)
  })

  it('does not propagate out of set() reporting write-failed', () => {
    const spy = consoleError()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    const def = persistentState('k', { default: 1, onError })
    def.set(2)
    expect(def.get()).toBe(2)
    expectLoggedOnce(spy)
  })

  it('is not called again when it throws while parse-failed is reported inside the serializer guard', () => {
    const spy = consoleError()
    localStorage.setItem('k', '{"__ps":1}')
    const serializer = { serialize: String, deserialize: Number }
    expect(persistentState('k', { default: 1, serializer, onError }).get()).toBe(1)
    expectLoggedOnce(spy)
  })
})
