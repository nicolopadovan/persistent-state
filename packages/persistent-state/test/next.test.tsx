// @vitest-environment node
import { renderToString } from 'react-dom/server'
import type { ReactElement, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { persistentState } from '@nicolopadovan/persistent-state'
import { CookieValuesProvider, useStoredState } from '@nicolopadovan/persistent-state/react'
import { PersistentStateProvider, readState } from '../src/next'

const requestCookies = vi.hoisted(() => new Map<string, string>())

vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => (requestCookies.has(name) ? { name, value: requestCookies.get(name)! } : undefined),
      getAll: () => {
        throw new Error('PersistentStateProvider must read only the listed cookies.')
      },
    }),
}))

beforeEach(() => requestCookies.clear())

const propsOf = (element: ReactElement) =>
  element.props as { cookies: Record<string, string>; listed: string[]; children: ReactNode }

describe('readState', () => {
  it('returns the decoded value of the cookie', async () => {
    requestCookies.set('theme', '"dark"')
    expect(await readState(persistentState('theme', { default: 'light', storage: 'cookie' }))).toBe('dark')
  })

  it.each([
    ['raw', 'ui:open'],
    ['encoded', 'ui%3Aopen'],
    ['double-encoded', 'ui%253Aopen'],
  ])('reads a cookie written by 0.2.1 under its %s name', async (_, name) => {
    requestCookies.set(name, '{"open":true}')
    const sidebar = persistentState('ui:open', { default: { open: false }, storage: 'cookie' })
    expect(await readState(sidebar)).toEqual({ open: true })
  })

  describe('with a version and a schema', () => {
    const settings = persistentState('settings', {
      default: { mode: 'light' },
      storage: 'cookie',
      version: 2,
      migrate: (stored, from) => ({ mode: from === 0 ? String(stored) : (stored as { theme: string }).theme }),
      schema: {
        '~standard': {
          version: 1,
          vendor: 'test',
          validate: (value) =>
            (value as { mode?: unknown }).mode === 'invalid'
              ? { issues: [{ message: 'bad mode' }] }
              : { value: value as { mode: string } },
        },
      },
      onError: () => {},
    })

    it('returns a migrated value', async () => {
      requestCookies.set('settings', '"dark"')
      expect(await readState(settings)).toEqual({ mode: 'dark' })
      requestCookies.set('settings', '{"__ps":1,"v":{"theme":"dim"},"ver":1}')
      expect(await readState(settings)).toEqual({ mode: 'dim' })
    })

    it('returns the default for a value the schema rejects, migrated or not', async () => {
      requestCookies.set('settings', '"invalid"')
      expect(await readState(settings)).toEqual({ mode: 'light' })
      requestCookies.set('settings', '{"__ps":1,"v":{"mode":"invalid"},"ver":2}')
      expect(await readState(settings)).toEqual({ mode: 'light' })
    })

    it('returns the default for a value stored by newer code', async () => {
      requestCookies.set('settings', '{"__ps":1,"v":{"mode":"dark"},"ver":3}')
      expect(await readState(settings)).toEqual({ mode: 'light' })
    })
  })

  it('returns the default without a cookie', async () => {
    expect(await readState(persistentState('theme', { default: 'light', storage: 'cookie' }))).toBe('light')
  })

  it('rejects a definition that is not a cookie definition', async () => {
    const draft = persistentState('draft', { default: '' })
    // @ts-expect-error only cookie definitions can be read on the server
    expect(await readState(draft)).toBe('')
  })
})

describe('PersistentStateProvider', () => {
  const theme = persistentState('theme', { default: 'light', storage: 'cookie' })
  const sidebar = persistentState('sidebar', { default: true, storage: 'cookie', namespace: 'ui' })

  it('passes the cookies of the listed definitions to CookieValuesProvider', async () => {
    requestCookies.set('theme', '"dark"')
    requestCookies.set('ui:sidebar', 'false')
    const children = <p>child</p>
    const element = await PersistentStateProvider({ states: [theme, sidebar], children })
    expect(element.type).toBe(CookieValuesProvider)
    expect(propsOf(element)).toEqual({
      cookies: { theme: '"dark"', 'ui:sidebar': 'false' },
      listed: ['theme', 'ui:sidebar'],
      children,
    })
  })

  it('leaves out the cookies it was not given', async () => {
    requestCookies.set('theme', '"dark"')
    requestCookies.set('session', 'secret')
    requestCookies.set('ui:sidebar', 'false')
    const element = await PersistentStateProvider({ states: [theme], children: null })
    expect(propsOf(element).cookies).toEqual({ theme: '"dark"' })
  })

  it('passes every legacy name variant of a listed key', async () => {
    requestCookies.set('ui%3Aopen', '1')
    requestCookies.set('ui%253Aopen', '2')
    const legacy = persistentState('ui:open', { default: 0, storage: 'cookie' })
    const element = await PersistentStateProvider({ states: [legacy], children: null })
    expect(propsOf(element).cookies).toEqual({ 'ui%3Aopen': '1', 'ui%253Aopen': '2' })
  })

  it('renders the stored values on the server without a warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    requestCookies.set('theme', '"dark"')
    function Show(): ReactNode {
      return `${useStoredState(theme)[0]} ${String(useStoredState(sidebar)[0])}`
    }
    const element = await PersistentStateProvider({ states: [theme, sidebar], children: <Show /> })
    expect(renderToString(element)).toBe('dark true')
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('still warns for a definition it was not given', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const unlisted = persistentState('unlisted', { default: 'x', storage: 'cookie' })
    function Show(): ReactNode {
      return useStoredState(unlisted)[0]
    }
    renderToString(await PersistentStateProvider({ states: [theme], children: <Show /> }))
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0]).toContain('"unlisted"')
    warn.mockRestore()
  })
})
