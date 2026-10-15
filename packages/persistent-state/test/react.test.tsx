import { act, renderHook } from '@testing-library/react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as core from '@nicolopadovan/persistent-state'
import { persistentState, type PersistentState, type StorageKind } from '@nicolopadovan/persistent-state'
import { CookieValuesProvider, usePersistentState, useStoredState } from '@nicolopadovan/persistent-state/react'
import { otherTabChanged, putRaw, resetEnvironment } from './helpers'

beforeEach(resetEnvironment)
afterEach(() => vi.restoreAllMocks())

function Show({ state }: { state: PersistentState<string, StorageKind> }): ReactNode {
  const [value, , { isPersistent }] = useStoredState(state)
  return <p>{`${state.storage}=${value} persistent=${String(isPersistent)}`}</p>
}

function hydrate(html: string, element: ReactNode) {
  const container = document.createElement('div')
  container.innerHTML = html
  document.body.append(container)
  const onRecoverableError = vi.fn()
  const consoleError = vi.spyOn(console, 'error')
  act(() => {
    hydrateRoot(container, element, { onRecoverableError })
  })
  return { container, onRecoverableError, consoleError }
}

describe('useStoredState without a provider', () => {
  it.each<StorageKind>(['localStorage', 'cookie'])('renders the stored %s value and writes through', (storage) => {
    const state = persistentState('k', { default: 'a', storage })
    state.set('stored')
    const { result } = renderHook(() => useStoredState(state))
    expect(result.current[0]).toBe('stored')
    act(() => result.current[1]((prev) => `${prev}!`))
    expect(result.current[0]).toBe('stored!')
    act(() => result.current[2].reset())
    expect(result.current[0]).toBe('a')
  })

  it('the root entry exports no provider', () => {
    expect(Object.keys(core).filter((name) => name.includes('Provider'))).toEqual([])
  })
})

describe('useStoredState', () => {
  it('keeps setValue and reset stable across renders', () => {
    const state = persistentState('k', { default: 0 })
    const { result, rerender } = renderHook(() => useStoredState(state))
    const [, setValue, { reset }] = result.current
    act(() => setValue(1))
    rerender()
    expect(result.current[1]).toBe(setValue)
    expect(result.current[2].reset).toBe(reset)
  })

  it('keeps two hooks on the same key in sync, also through two definitions', () => {
    const first = persistentState('k', { default: 'a' })
    const second = persistentState('k', { default: 'a' })
    const { result } = renderHook(() => [useStoredState(first), useStoredState(first), useStoredState(second)])
    act(() => result.current[0][1]('b'))
    expect(result.current.map(([value]) => value)).toEqual(['b', 'b', 'b'])
    act(() => result.current[2][2].reset())
    expect(result.current.map(([value]) => value)).toEqual(['a', 'a', 'a'])
  })

  it('reports isPersistent false once storage turns out to be unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const state = persistentState('k', { default: 'a', onError: () => {} })
    const { result } = renderHook(() => useStoredState(state))
    expect(result.current[2].isPersistent).toBe(false)
  })
})

describe('an onError that throws', () => {
  it('does not break the render of a hook', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    const boom = new Error('boom')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const state = persistentState('k', {
      default: 'a',
      onError: () => {
        throw boom
      },
    })
    const { result } = renderHook(() => useStoredState(state))
    expect(result.current[0]).toBe('a')
    expect(consoleError).toHaveBeenCalledWith('[persistent-state]', expect.stringContaining('onError'), boom)
  })
})

describe('server rendering and hydration', () => {
  it.each(['localStorage', 'sessionStorage'] as const)(
    'renders the %s default on the server even when storage holds a value, then hydrates without a mismatch',
    (storage) => {
      const state = persistentState('k', { default: 'default', storage })
      window[storage].setItem('k', '"stored"')
      const html = renderToString(<Show state={state} />)
      expect(html).toContain(`${storage}=default persistent=true`)
      const { container, onRecoverableError, consoleError } = hydrate(html, <Show state={state} />)
      expect(onRecoverableError).not.toHaveBeenCalled()
      expect(consoleError).not.toHaveBeenCalled()
      expect(container.textContent).toBe(`${storage}=stored persistent=true`)
    },
  )

  it('renders a cookie without a provider as its default on the server', () => {
    document.cookie = 'k=%22stored%22'
    const state = persistentState('k', { default: 'default', storage: 'cookie' })
    expect(renderToString(<Show state={state} />)).toContain('cookie=default persistent=true')
  })

  it.each([{ k: '"stored"' }, 'other=1; k=%22stored%22'])(
    'renders the provider cookie %j on the server and hydrates it without a change',
    (cookies) => {
      document.cookie = 'k=%22stored%22'
      const state = persistentState('k', { default: 'default', storage: 'cookie' })
      const app = (
        <CookieValuesProvider cookies={cookies}>
          <Show state={state} />
        </CookieValuesProvider>
      )
      const html = renderToString(app)
      expect(html).toContain('cookie=stored persistent=true')
      const { container, onRecoverableError, consoleError } = hydrate(html, app)
      expect(onRecoverableError).not.toHaveBeenCalled()
      expect(consoleError).not.toHaveBeenCalled()
      expect(container.textContent).toBe('cookie=stored persistent=true')
    },
  )

  it('decodes a provider cookie once per provider, so the server snapshot is stable', () => {
    const state = persistentState('k', { default: { n: 0 }, storage: 'cookie' })
    const values: unknown[] = []
    function Read(): ReactNode {
      values.push(useStoredState(state)[0])
      return null
    }
    renderToString(
      <CookieValuesProvider cookies={{ k: '{"n":1}' }}>
        <Read />
        <Read />
      </CookieValuesProvider>,
    )
    expect(values[0]).toEqual({ n: 1 })
    expect(values[1]).toBe(values[0])
  })
})

describe('usePersistentState', () => {
  it('calls a lazy initial once and uses it as the default', () => {
    const initial = vi.fn(() => 'lazy')
    const { result, rerender } = renderHook(() => usePersistentState('k', initial))
    rerender()
    expect(result.current[0]).toBe('lazy')
    expect(initial).toHaveBeenCalledTimes(1)
  })

  it('accepts the deprecated storageType and syncAcrossTabs aliases', () => {
    const { result } = renderHook(() =>
      usePersistentState('k', 'a', { storageType: 'sessionStorage', syncAcrossTabs: true }),
    )
    act(() => result.current[1]('b'))
    expect(sessionStorage.getItem('k')).toBe('"b"')
    expect(localStorage.getItem('k')).toBeNull()
  })

  describe.each(['localStorage', 'cookie'] as const)('with %s in another tab', (storage) => {
    it.each([
      ['by default', {}, 'b'],
      ['with sync: true', { sync: true }, 'b'],
      ['with syncAcrossTabs: true', { syncAcrossTabs: true }, 'b'],
      ['with sync: false', { sync: false }, 'a'],
      ['with syncAcrossTabs: false', { syncAcrossTabs: false }, 'a'],
    ])("shows the other tab's value %s only when syncing", (_name, options, expected) => {
      const { result } = renderHook(() => usePersistentState('k', 'a', { storage, ...options }))
      act(() => {
        putRaw(storage, 'k', '"b"')
        otherTabChanged(storage, 'k')
      })
      expect(result.current[0]).toBe(expected)
    })
  })

  it('stores under namespace:key and shares the value with a definition of the same name', () => {
    const state = persistentState('k', { default: 0, namespace: 'app' })
    const { result } = renderHook(() => [usePersistentState('k', 0, { namespace: 'app' }), useStoredState(state)])
    act(() => result.current[0][1](5))
    expect(localStorage.getItem('app:k')).toBe('5')
    expect(result.current[1][0]).toBe(5)
  })

  it('writes a cookie with cookie options', () => {
    const { result } = renderHook(() => usePersistentState('c', 'a', { storage: 'cookie', expires: 0 }))
    act(() => result.current[1]('b'))
    expect(document.cookie).toContain('c=%22b%22')
  })

  it('follows a key change', () => {
    localStorage.setItem('two', '2')
    const { result, rerender } = renderHook(({ key }) => usePersistentState(key, 0), { initialProps: { key: 'one' } })
    expect(result.current[0]).toBe(0)
    rerender({ key: 'two' })
    expect(result.current[0]).toBe(2)
  })
})
