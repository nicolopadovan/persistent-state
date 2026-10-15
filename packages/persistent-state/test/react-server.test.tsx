// @vitest-environment node
import { renderToString } from 'react-dom/server'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { persistentState, type PersistentState } from '@nicolopadovan/persistent-state'
import { CookieValuesProvider, usePersistentState, useStoredState } from '@nicolopadovan/persistent-state/react'

function Show({ state }: { state: PersistentState<string, 'cookie'> }): ReactNode {
  const [value, , { isPersistent }] = useStoredState(state)
  return `${value} ${String(isPersistent)}`
}

describe('on the server', () => {
  it('renders the provider value with isPersistent true', () => {
    const state = persistentState('theme', { default: 'light', storage: 'cookie' })
    const html = renderToString(
      <CookieValuesProvider cookies="theme=%22dark%22">
        <Show state={state} />
      </CookieValuesProvider>,
    )
    expect(html).toBe('dark true')
  })

  it('warns once when a provider holds no cookie for a cookie definition', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const state = persistentState('missing', { default: 'light', storage: 'cookie' })
    const app = (
      <CookieValuesProvider cookies={{ other: '1' }}>
        <Show state={state} />
      </CookieValuesProvider>
    )
    expect(renderToString(app)).toBe('light true')
    renderToString(app)
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0]).toContain('"missing"')
  })

  it('does not warn for a listed definition the visitor has no cookie for', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const state = persistentState('absent', { default: 'light', storage: 'cookie' })
    const html = renderToString(
      <CookieValuesProvider cookies={{}} listed={['absent']}>
        <Show state={state} />
      </CookieValuesProvider>,
    )
    expect(html).toBe('light true')
    expect(warn).not.toHaveBeenCalled()
  })

  it('warns for a definition missing from listed even when its cookie is in the record', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const state = persistentState('unlisted', { default: 'light', storage: 'cookie' })
    const html = renderToString(
      <CookieValuesProvider cookies={{ unlisted: '"dark"' }} listed={['other']}>
        <Show state={state} />
      </CookieValuesProvider>,
    )
    expect(html).toBe('dark true')
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0]).toContain('"unlisted"')
  })

  it('renders usePersistentState with its default', () => {
    function Count(): ReactNode {
      return usePersistentState('count', () => 3)[0]
    }
    expect(renderToString(<Count />)).toBe('3')
  })
})
