import { afterEach, describe, expect, it, vi } from 'vitest'
import { persistentState, type StorageKind } from '../../src/index'

type Library = typeof import('../../src/index')
interface Tab {
  window: Window
  library: Library
  close(): void
  navigateAway(): Promise<void>
}

const tabs: Tab[] = []
let count = 0
const unique = (): string => `sync-${(count += 1)}-${Math.random().toString(36).slice(2)}`

const loaded = (frame: HTMLIFrameElement): Promise<void> =>
  new Promise((resolve) => frame.addEventListener('load', () => resolve(), { once: true }))

async function openTab(): Promise<Tab> {
  const frame = document.createElement('iframe')
  frame.src = new URL('./frame.html', import.meta.url).href
  document.body.append(frame)
  await loaded(frame)
  const tab: Tab = {
    window: frame.contentWindow as Window,
    library: (frame.contentWindow as unknown as { persistentState: Library }).persistentState,
    close: () => frame.remove(),
    async navigateAway() {
      const done = loaded(frame)
      frame.src = 'about:blank'
      await done
    },
  }
  tabs.push(tab)
  return tab
}

const raw = (storage: StorageKind, key: string): string | null => {
  if (storage === 'cookie') return cookieValue(key)
  return window[storage].getItem(key)
}

const cookieValue = (key: string): string | null => {
  const pair = document.cookie.split('; ').find((entry) => entry.startsWith(`${key}=`))
  return pair ? decodeURIComponent(pair.slice(key.length + 1)) : null
}

afterEach(() => {
  tabs.splice(0).forEach((tab) => tab.close())
})

describe.each(['localStorage', 'cookie'] as const)('%s across two real pages', (storage) => {
  it('follows a change made in the other page and notifies once', async () => {
    const key = unique()
    const here = persistentState(key, { default: 'a', storage })
    const tab = await openTab()
    const there = tab.library.persistentState(key, { default: 'a', storage })
    expect(here.get()).toBe('a')
    expect(there.get()).toBe('a')
    const listener = vi.fn()
    here.subscribe(listener)

    there.set('b')

    await expect.poll(() => here.get()).toBe('b')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('follows a change in the other direction', async () => {
    const key = unique()
    const here = persistentState(key, { default: 'a', storage })
    const tab = await openTab()
    const there = tab.library.persistentState(key, { default: 'a', storage })
    expect(there.get()).toBe('a')

    here.set('b')

    await expect.poll(() => there.get()).toBe('b')
  })

  it('follows a reset made in the other page with the default', async () => {
    const key = unique()
    const here = persistentState(key, { default: 'a', storage })
    here.set('b')
    const tab = await openTab()
    const there = tab.library.persistentState(key, { default: 'a', storage })
    expect(there.get()).toBe('b')

    here.reset()

    await expect.poll(() => there.get()).toBe('a')
  })

  it('ignores a change to another key', async () => {
    const [watched, other, control] = [unique(), unique(), unique()]
    const here = persistentState(watched, { default: 'a', storage })
    const followed = persistentState(control, { default: 'a', storage })
    const tab = await openTab()
    expect(here.get()).toBe('a')
    expect(followed.get()).toBe('a')

    tab.library.persistentState(other, { default: 'a', storage }).set('b')
    tab.library.persistentState(control, { default: 'a', storage }).set('c')

    await expect.poll(() => followed.get()).toBe('c')
    expect(here.get()).toBe('a')
  })

  it('stays put with sync: false', async () => {
    const [off, on] = [unique(), unique()]
    const unsynced = persistentState(off, { default: 'a', storage, sync: false })
    const synced = persistentState(on, { default: 'a', storage })
    const tab = await openTab()
    expect(unsynced.get()).toBe('a')
    expect(synced.get()).toBe('a')

    tab.library.persistentState(off, { default: 'a', storage }).set('b')
    tab.library.persistentState(on, { default: 'a', storage }).set('b')

    await expect.poll(() => synced.get()).toBe('b')
    expect(raw(storage, off)).toBe('"b"')
    expect(unsynced.get()).toBe('a')
  })
})

describe('sessionStorage across two real pages', () => {
  it('is never synced, although both pages share the storage area and receive its storage events', async () => {
    const [session, control] = [unique(), unique()]
    const here = persistentState(session, { default: 'a', storage: 'sessionStorage' })
    const followed = persistentState(control, { default: 'a' })
    const tab = await openTab()
    expect(here.get()).toBe('a')
    expect(followed.get()).toBe('a')

    tab.library.persistentState(session, { default: 'a', storage: 'sessionStorage' }).set('b')
    tab.library.persistentState(control, { default: 'a' }).set('b')

    await expect.poll(() => followed.get()).toBe('b')
    expect(sessionStorage.getItem(session)).toBe('"b"')
    expect(here.get()).toBe('a')
  })
})

describe.each(['localStorage', 'cookie'] as const)('a debounced %s write', (storage) => {
  it('is flushed by the real pagehide of its page and not before', async () => {
    const key = unique()
    const tab = await openTab()
    const there = tab.library.persistentState(key, { default: 'a', storage, debounceMs: 60_000 })

    there.set('b')

    expect(there.get()).toBe('b')
    expect(raw(storage, key)).toBeNull()
    let atPagehide: string | null | undefined
    tab.window.addEventListener('pagehide', () => (atPagehide = raw(storage, key)))

    await tab.navigateAway()

    expect(atPagehide).toBe('"b"')
    expect(raw(storage, key)).toBe('"b"')
  })
})
