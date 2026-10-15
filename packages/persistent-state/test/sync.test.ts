import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { persistentState } from '@nicolopadovan/persistent-state'
import {
  FakeBroadcastChannel,
  getRaw,
  openChannel,
  otherTabChanged,
  putRaw,
  resetEnvironment,
  spyOnWrites,
} from './helpers'

const SYNCED = ['localStorage', 'cookie'] as const

const versioned = (ver: number, v: unknown): string => JSON.stringify({ __ps: 1, v, ver })

const becomeVisible = (visibility: 'visible' | 'hidden'): void => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(visibility)
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(resetEnvironment)
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe.each(SYNCED)('syncing %s', (storage) => {
  it('re-reads when another tab changed it and notifies once', () => {
    const def = persistentState('k', { default: 'a', storage })
    expect(def.get()).toBe('a')
    const listener = vi.fn()
    def.subscribe(listener)
    putRaw(storage, 'k', '"b"')
    otherTabChanged(storage, 'k')
    expect(def.get()).toBe('b')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('does not notify when the value is unchanged', () => {
    putRaw(storage, 'k', '"a"')
    const def = persistentState('k', { default: 'x', storage })
    def.get()
    const listener = vi.fn()
    def.subscribe(listener)
    otherTabChanged(storage, 'k')
    expect(listener).not.toHaveBeenCalled()
  })

  it('follows a removal made in another tab with the default', () => {
    putRaw(storage, 'k', '"b"')
    const def = persistentState('k', { default: 'a', storage })
    expect(def.get()).toBe('b')
    if (storage === 'cookie') document.cookie = 'k=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
    else localStorage.removeItem('k')
    otherTabChanged(storage, 'k')
    expect(def.get()).toBe('a')
  })

  it('ignores another key', () => {
    const def = persistentState('k', { default: 'a', storage })
    def.get()
    putRaw(storage, 'k', '"b"')
    otherTabChanged(storage, 'other')
    expect(def.get()).toBe('a')
  })

  it('does nothing when sync is false', () => {
    const def = persistentState('k', { default: 'a', storage, sync: false })
    def.get()
    putRaw(storage, 'k', '"b"')
    otherTabChanged(storage, 'k')
    becomeVisible('visible')
    expect(def.get()).toBe('a')
  })

  it('keeps a debounced write of this tab', () => {
    vi.useFakeTimers()
    const def = persistentState('k', { default: 'a', storage, debounceMs: 100 })
    def.set('mine')
    putRaw(storage, 'k', '"theirs"')
    otherTabChanged(storage, 'k')
    expect(def.get()).toBe('mine')
    vi.advanceTimersByTime(100)
    expect(getRaw(storage, 'k')).toBe('"mine"')
  })

  it('does not follow while consent is false', () => {
    const def = persistentState('k', { default: 'a', storage, consent: () => false })
    def.get()
    putRaw(storage, 'k', '"b"')
    otherTabChanged(storage, 'k')
    expect(def.get()).toBe('a')
  })

  it('keeps the default and writes nothing when another tab stored a newer version', () => {
    const onError = vi.fn()
    const migrate = (stored: unknown): string => String(stored)
    const def = persistentState('k', { default: 'a', storage, version: 1, migrate, onError })
    putRaw(storage, 'k', versioned(1, 'mine'))
    def.set('mine')
    putRaw(storage, 'k', versioned(2, 'newer'))
    const listener = vi.fn()
    def.subscribe(listener)
    const writes = spyOnWrites(storage, 'k')
    otherTabChanged(storage, 'k')
    expect(def.get()).toBe('a')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'version-ahead' }))
    expect(writes()).toBe(0)
    expect(getRaw(storage, 'k')).toBe(versioned(2, 'newer'))
  })
})

describe('localStorage events', () => {
  it('re-reads every localStorage definition when the storage was cleared, and no other storage', () => {
    const local = persistentState('a', { default: 0 })
    const session = persistentState('b', { default: 0, storage: 'sessionStorage' })
    const cookie = persistentState('c', { default: 0, storage: 'cookie' })
    ;[local, session, cookie].forEach((def) => def.get())
    localStorage.setItem('a', '1')
    sessionStorage.setItem('b', '1')
    putRaw('cookie', 'c', '1')
    window.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: localStorage }))
    expect([local.get(), session.get(), cookie.get()]).toEqual([1, 0, 0])
  })

  it('ignores events of sessionStorage', () => {
    const local = persistentState('k', { default: 'a' })
    local.get()
    localStorage.setItem('k', '"b"')
    window.dispatchEvent(new StorageEvent('storage', { key: 'k', storageArea: sessionStorage }))
    expect(local.get()).toBe('a')
  })

  it('never syncs sessionStorage', () => {
    const def = persistentState('k', { default: 'a', storage: 'sessionStorage' })
    def.get()
    sessionStorage.setItem('k', '"b"')
    window.dispatchEvent(new StorageEvent('storage', { key: 'k', storageArea: sessionStorage }))
    expect(def.get()).toBe('a')
  })
})

describe('cookie messages', () => {
  it('posts the full key on a channel named persistent-state after a write and after a reset', () => {
    const def = persistentState('k', { default: 'a', storage: 'cookie', namespace: 'ns' })
    def.set('b')
    def.reset()
    expect(openChannel().name).toBe('persistent-state')
    expect(openChannel().posted).toEqual(['cookie:ns:k', 'cookie:ns:k'])
  })

  it('opens no channel for Web Storage', () => {
    persistentState('k', { default: 'a' }).set('b')
    persistentState('s', { default: 'a', storage: 'sessionStorage' }).set('b')
    expect(FakeBroadcastChannel.instances).toEqual([])
  })

  it('posts nothing when the cookie was not written', () => {
    const def = persistentState('k', { default: 'a', storage: 'cookie', onError: () => {} })
    vi.spyOn(Document.prototype, 'cookie', 'set').mockImplementation(() => {})
    def.set('b')
    expect(openChannel().posted).toEqual([])
  })

  it('ignores a message with an unknown id', () => {
    const def = persistentState('k', { default: 'a', storage: 'cookie' })
    def.get()
    putRaw('cookie', 'k', '"b"')
    openChannel().onmessage?.({ data: 'cookie:other' })
    expect(def.get()).toBe('a')
  })

  it('re-reads once more after 50 ms when the first read found no change', () => {
    vi.useFakeTimers()
    const def = persistentState('k', { default: 'a', storage: 'cookie' })
    const listener = vi.fn()
    def.subscribe(listener)
    def.get()
    otherTabChanged('cookie', 'k')
    putRaw('cookie', 'k', '"b"')
    vi.advanceTimersByTime(49)
    expect(def.get()).toBe('a')
    vi.advanceTimersByTime(1)
    expect(def.get()).toBe('b')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('reads the cookie twice for a message that changed nothing and once for one that did', () => {
    vi.useFakeTimers()
    const def = persistentState('k', { default: 'a', storage: 'cookie' })
    def.get()
    const reads = vi.spyOn(Document.prototype, 'cookie', 'get')
    otherTabChanged('cookie', 'k')
    vi.advanceTimersByTime(1000)
    expect(reads).toHaveBeenCalledTimes(2)
    putRaw('cookie', 'k', '"b"')
    reads.mockClear()
    otherTabChanged('cookie', 'k')
    vi.advanceTimersByTime(1000)
    expect(reads).toHaveBeenCalledTimes(1)
  })

  it('does not re-read after consent was withdrawn during the delay', () => {
    vi.useFakeTimers()
    let granted = true
    const def = persistentState('k', { default: 'a', storage: 'cookie', consent: () => granted })
    def.get()
    otherTabChanged('cookie', 'k')
    granted = false
    putRaw('cookie', 'k', '"b"')
    vi.advanceTimersByTime(50)
    expect(def.get()).toBe('a')
  })

  it('does not re-read when sync is false', () => {
    vi.useFakeTimers()
    const def = persistentState('k', { default: 'a', storage: 'cookie', sync: false })
    def.get()
    otherTabChanged('cookie', 'k')
    putRaw('cookie', 'k', '"b"')
    vi.advanceTimersByTime(50)
    expect(def.get()).toBe('a')
  })

  it('works without a BroadcastChannel', () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    const def = persistentState('k', { default: 'a', storage: 'cookie' })
    expect(() => def.set('b')).not.toThrow()
    expect(getRaw('cookie', 'k')).toBe('"b"')
  })

  it('works when the BroadcastChannel cannot be created', () => {
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        constructor() {
          throw new DOMException('denied', 'SecurityError')
        }
      },
    )
    const def = persistentState('k', { default: 'a', storage: 'cookie' })
    expect(() => def.set('b')).not.toThrow()
    expect(getRaw('cookie', 'k')).toBe('"b"')
  })
})

describe('becoming visible', () => {
  it('re-reads a cookie when the page becomes visible, not when it becomes hidden', () => {
    const def = persistentState('k', { default: 'a', storage: 'cookie' })
    def.get()
    putRaw('cookie', 'k', '"b"')
    becomeVisible('hidden')
    expect(def.get()).toBe('a')
    becomeVisible('visible')
    expect(def.get()).toBe('b')
  })

  it('leaves localStorage to its events', () => {
    const def = persistentState('k', { default: 'a' })
    def.get()
    localStorage.setItem('k', '"b"')
    becomeVisible('visible')
    expect(def.get()).toBe('a')
  })
})
