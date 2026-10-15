import { vi } from 'vitest'
import type { StorageKind } from '@nicolopadovan/persistent-state'

export function resetEnvironment(): void {
  delete (globalThis as { __persistentState?: unknown }).__persistentState
  stubBroadcastChannel()
  localStorage.clear()
  sessionStorage.clear()
  for (const pair of document.cookie.split('; ')) {
    const name = pair.slice(0, pair.indexOf('='))
    if (name) document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`
  }
}

export const freshPage = (): void => {
  delete (globalThis as { __persistentState?: unknown }).__persistentState
}

export function putRaw(storage: StorageKind, key: string, text: string): void {
  if (storage === 'cookie') document.cookie = `${key}=${encodeURIComponent(text)}; path=/`
  else window[storage].setItem(key, text)
}

export function getRaw(storage: StorageKind, key: string): string | null {
  if (storage !== 'cookie') return window[storage].getItem(key)
  const pair = document.cookie.split('; ').find((entry) => entry.startsWith(`${key}=`))
  return pair ? decodeURIComponent(pair.slice(key.length + 1)) : null
}

export function spyOnWrites(storage: StorageKind, key: string): () => number {
  if (storage === 'cookie') {
    const spy = vi.spyOn(Document.prototype, 'cookie', 'set')
    return () => spy.mock.calls.length
  }
  const set = vi.spyOn(Storage.prototype, 'setItem')
  const remove = vi.spyOn(Storage.prototype, 'removeItem')
  return () => [...set.mock.calls, ...remove.mock.calls].filter(([name]) => name === key).length
}

export class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = []
  onmessage: ((event: { data: unknown }) => void) | null = null
  readonly posted: unknown[] = []
  constructor(readonly name: string) {
    FakeBroadcastChannel.instances.push(this)
  }
  postMessage(data: unknown): void {
    this.posted.push(data)
  }
}

function stubBroadcastChannel(): void {
  FakeBroadcastChannel.instances = []
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
}

export const openChannel = (): FakeBroadcastChannel => FakeBroadcastChannel.instances.at(-1) as FakeBroadcastChannel

export function otherTabChanged(storage: 'localStorage' | 'cookie', key: string): void {
  if (storage === 'cookie') openChannel().onmessage?.({ data: `cookie:${key}` })
  else window.dispatchEvent(new StorageEvent('storage', { key, storageArea: localStorage }))
}
