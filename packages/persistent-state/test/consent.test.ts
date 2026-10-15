import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  persistentState,
  readCookieState,
  refreshConsent,
  type StandardSchemaV1,
  type StorageKind,
} from '@nicolopadovan/persistent-state'
import { getRaw, putRaw, resetEnvironment, spyOnWrites } from './helpers'

const STORAGES: StorageKind[] = ['localStorage', 'sessionStorage', 'cookie']

beforeEach(resetEnvironment)
afterEach(stopSpying)

let restoreCookie: (() => void) | undefined

function stopSpying() {
  vi.restoreAllMocks()
  restoreCookie?.()
  restoreCookie = undefined
}

function spyOnAccess(storage: StorageKind): () => number {
  if (storage === 'cookie') {
    const original = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')!
    let count = 0
    Object.defineProperty(Document.prototype, 'cookie', {
      configurable: true,
      get(this: Document) {
        count += 1
        return original.get!.call(this) as string
      },
      set(this: Document, value: string) {
        count += 1
        original.set!.call(this, value)
      },
    })
    restoreCookie = () => Object.defineProperty(Document.prototype, 'cookie', original)
    return () => count
  }
  const spies = (['getItem', 'setItem', 'removeItem'] as const).map((method) => vi.spyOn(Storage.prototype, method))
  return () => spies.reduce((total, spy) => total + spy.mock.calls.length, 0)
}

function consentGate(initial = false) {
  const gate = { allowed: initial, consent: () => gate.allowed }
  return gate
}

describe.each(STORAGES)('consent with %s', (storage) => {
  it('neither reads nor writes storage while consent is false', () => {
    putRaw(storage, 'k', '"stored"')
    const access = spyOnAccess(storage)
    const def = persistentState('k', { default: 'd', storage, consent: () => false })
    const listener = vi.fn()
    def.subscribe(listener)
    expect(def.get()).toBe('d')
    expect(def.isPersistent()).toBe(false)
    def.set('memory')
    expect(def.get()).toBe('memory')
    expect(def.isPersistent()).toBe(false)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(access()).toBe(0)
  })

  it('writes a value set in memory once refreshConsent sees consent', () => {
    putRaw(storage, 'k', '"stored"')
    const gate = consentGate()
    const def = persistentState('k', { default: 'd', storage, consent: gate.consent })
    const listener = vi.fn()
    def.subscribe(listener)
    def.set('memory')
    gate.allowed = true
    const writes = spyOnWrites(storage, 'k')
    refreshConsent()
    expect(writes()).toBe(1)
    expect(getRaw(storage, 'k')).toBe('"memory"')
    expect(def.get()).toBe('memory')
    expect(def.isPersistent()).toBe(true)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('reads the stored value and notifies once refreshConsent sees consent', () => {
    putRaw(storage, 'k', '"stored"')
    const gate = consentGate()
    const def = persistentState('k', { default: 'd', storage, consent: gate.consent })
    const listener = vi.fn()
    def.subscribe(listener)
    expect(def.get()).toBe('d')
    gate.allowed = true
    refreshConsent()
    expect(def.get()).toBe('stored')
    expect(def.isPersistent()).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('keeps the stored item and the memory value when consent is withdrawn, and stops writing', () => {
    putRaw(storage, 'k', '"stored"')
    const gate = consentGate(true)
    const def = persistentState('k', { default: 'd', storage, consent: gate.consent })
    expect(def.get()).toBe('stored')
    gate.allowed = false
    refreshConsent()
    expect(def.isPersistent()).toBe(false)
    expect(getRaw(storage, 'k')).toBe('"stored"')
    expect(def.get()).toBe('stored')
    def.set('memory')
    expect(getRaw(storage, 'k')).toBe('"stored"')
    expect(def.isPersistent()).toBe(false)
  })

  it('checks consent before every write, without waiting for refreshConsent', () => {
    const gate = consentGate(true)
    const def = persistentState('k', { default: 'd', storage, consent: gate.consent })
    def.set('one')
    gate.allowed = false
    def.set('two')
    expect(getRaw(storage, 'k')).toBe('"one"')
    expect(def.get()).toBe('two')
    expect(def.isPersistent()).toBe(false)
    gate.allowed = true
    def.set('three')
    expect(getRaw(storage, 'k')).toBe('"three"')
    expect(def.isPersistent()).toBe(true)
  })

  it('does not write a debounced value after consent is withdrawn', () => {
    vi.useFakeTimers()
    const gate = consentGate(true)
    const def = persistentState('k', { default: 'd', storage, debounceMs: 100, consent: gate.consent })
    def.set('pending')
    gate.allowed = false
    vi.advanceTimersByTime(100)
    vi.useRealTimers()
    expect(getRaw(storage, 'k')).toBeNull()
    gate.allowed = true
    refreshConsent()
    expect(getRaw(storage, 'k')).toBe('"pending"')
  })

  it('evaluates the predicate on first use, before every write and in refreshConsent, not on later reads', () => {
    const consent = vi.fn(() => true)
    const def = persistentState('k', { default: 0, storage, consent })
    expect(consent).not.toHaveBeenCalled()
    def.get()
    def.get()
    expect(consent).toHaveBeenCalledTimes(1)
    def.set(1)
    expect(consent).toHaveBeenCalledTimes(2)
    refreshConsent()
    expect(consent).toHaveBeenCalledTimes(3)
  })

  it('does not read, write or notify in refreshConsent when the predicate did not change', () => {
    putRaw(storage, 'k', '"stored"')
    const def = persistentState('k', { default: 'd', storage, consent: () => true })
    const listener = vi.fn()
    def.subscribe(listener)
    def.get()
    const access = spyOnAccess(storage)
    refreshConsent()
    expect(access()).toBe(0)
    expect(listener).not.toHaveBeenCalled()
  })

  it('treats a predicate that returns a falsy non-boolean as no consent', () => {
    const access = spyOnAccess(storage)
    const def = persistentState('k', { default: 'd', storage, consent: (() => undefined) as unknown as () => boolean })
    def.set('memory')
    expect(access()).toBe(0)
  })

  it('treats a throwing predicate as no consent, logs it, and still removes the item on reset', () => {
    putRaw(storage, 'k', '"stored"')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const def = persistentState('k', {
      default: 'd',
      storage,
      consent: () => {
        throw new Error('not ready')
      },
    })
    expect(def.get()).toBe('d')
    def.set('memory')
    expect(def.get()).toBe('memory')
    expect(getRaw(storage, 'k')).toBe('"stored"')
    expect(() => refreshConsent()).not.toThrow()
    def.reset()
    expect(getRaw(storage, 'k')).toBeNull()
    expect(error).toHaveBeenCalled()
  })

  describe('reset', () => {
    it('removes the stored item, sets the default and notifies every subscriber while consent is false', () => {
      putRaw(storage, 'k', '"stored"')
      const first = persistentState('k', { default: 'd', storage, consent: () => false })
      const second = persistentState('k', { default: 'd', storage, consent: () => false })
      const listeners = [vi.fn(), vi.fn()]
      first.subscribe(listeners[0])
      second.subscribe(listeners[1])
      first.set('memory')
      second.reset()
      expect(getRaw(storage, 'k')).toBeNull()
      expect([first.get(), second.get()]).toEqual(['d', 'd'])
      listeners.forEach((listener) => expect(listener).toHaveBeenCalledTimes(2))
    })

    it('does not write the default back once consent is granted', () => {
      const gate = consentGate()
      const def = persistentState('k', { default: 'd', storage, consent: gate.consent })
      def.set('memory')
      def.reset()
      gate.allowed = true
      refreshConsent()
      expect(getRaw(storage, 'k')).toBeNull()
      expect(def.get()).toBe('d')
    })
  })

  describe('write-back', () => {
    const migrating = (consent: () => boolean) =>
      persistentState('k', {
        default: 'd',
        storage,
        version: 1,
        migrate: (stored) => `migrated:${String(stored)}`,
        consent,
        onError: () => {},
      })
    const MIGRATED = JSON.stringify({ __ps: 1, v: 'migrated:old', ver: 1 })

    it('does not migrate or write while consent is false, and writes once after refreshConsent', () => {
      putRaw(storage, 'k', 'old')
      const gate = consentGate()
      const writes = spyOnWrites(storage, 'k')
      const def = migrating(gate.consent)
      expect(def.get()).toBe('d')
      expect(writes()).toBe(0)
      expect(getRaw(storage, 'k')).toBe('old')
      gate.allowed = true
      refreshConsent()
      expect(def.get()).toBe('migrated:old')
      expect(writes()).toBe(1)
      expect(getRaw(storage, 'k')).toBe(MIGRATED)
    })

    it('does not write the migrated value when consent is withdrawn during the read', () => {
      putRaw(storage, 'k', 'old')
      const writes = spyOnWrites(storage, 'k')
      const def = migrating(vi.fn().mockReturnValueOnce(true).mockReturnValue(false) as () => boolean)
      expect(def.get()).toBe('migrated:old')
      expect(def.isPersistent()).toBe(false)
      expect(writes()).toBe(0)
      expect(getRaw(storage, 'k')).toBe('old')
    })

    it('does not write the schema output while consent is false', () => {
      putRaw(storage, 'k', '"x"')
      const schema: StandardSchemaV1<unknown, string> = {
        '~standard': { version: 1, vendor: 'test', validate: (value) => ({ value: String(value).toUpperCase() }) },
      }
      const writes = spyOnWrites(storage, 'k')
      const def = persistentState('k', { default: 'd', storage, schema, consent: () => false })
      expect(def.get()).toBe('d')
      expect(writes()).toBe(0)
    })
  })
})

it('does not evaluate the predicate in readCookieState', () => {
  const consent = vi.fn(() => false)
  const def = persistentState('k', { default: 'd', storage: 'cookie', consent })
  expect(readCookieState(def, 'k="stored"')).toBe('stored')
  expect(consent).not.toHaveBeenCalled()
})

it('removes every cookie name variant on reset while consent is false', () => {
  document.cookie = 'my:key=1; path=/'
  document.cookie = 'my%253Akey=2; path=/'
  document.cookie = 'other=3; path=/'
  const def = persistentState('my:key', { default: 0, storage: 'cookie', consent: () => false })
  def.reset()
  expect(document.cookie).toBe('other=3')
})

it('leaves definitions that were never used alone in refreshConsent', () => {
  const consent = vi.fn(() => true)
  persistentState('k', { default: 0, consent })
  refreshConsent()
  expect(consent).not.toHaveBeenCalled()
})

describe('with an object shaped like ConsentLayer analytics.consent', () => {
  type Consent = { preferences: boolean } | null

  function consentManager() {
    let current: Consent = null
    const listeners = new Set<(state: { consent: Consent }) => void>()
    return {
      getConsent: () => current,
      subscribe(listener: (state: { consent: Consent }) => void) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      decide(next: Consent) {
        current = next
        listeners.forEach((listener) => listener({ consent: current }))
      },
    }
  }

  it('stores nothing before the visitor decides, follows the decision and removes the item on withdrawal', () => {
    putRaw('cookie', 'theme', '"dark"')
    const analytics = { consent: consentManager() }
    const theme = persistentState('theme', {
      default: 'system',
      storage: 'cookie',
      consent: () => analytics.consent.getConsent()?.preferences === true,
    })
    analytics.consent.subscribe(({ consent }) => {
      if (!consent?.preferences) theme.reset()
      refreshConsent()
    })
    const access = spyOnAccess('cookie')
    expect(theme.get()).toBe('system')
    expect(access()).toBe(0)
    stopSpying()

    analytics.consent.decide({ preferences: true })
    expect(theme.get()).toBe('dark')
    expect(theme.isPersistent()).toBe(true)
    theme.set('light')
    expect(getRaw('cookie', 'theme')).toBe('"light"')

    analytics.consent.decide({ preferences: false })
    expect(getRaw('cookie', 'theme')).toBeNull()
    expect(theme.get()).toBe('system')
    expect(theme.isPersistent()).toBe(false)
    theme.set('dark')
    expect(getRaw('cookie', 'theme')).toBeNull()
  })
})
