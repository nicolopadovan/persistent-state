import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { persistentState, type PersistentState, type StorageKind } from '../../src/index'
import { CookieValuesProvider, useStoredState } from '../../src/react/index'

let count = 0
const unique = (): string => `hydration-${(count += 1)}-${Math.random().toString(36).slice(2)}`

const cleanups: (() => void)[] = []

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup())
  vi.restoreAllMocks()
})

function Show({ state, id }: { state: PersistentState<string, StorageKind>; id: string }): ReactNode {
  const [value] = useStoredState(state)
  return <p id={id}>{value}</p>
}

function hydrate(html: string, element: ReactNode) {
  const container = document.createElement('div')
  container.innerHTML = html
  document.body.append(container)
  const onRecoverableError = vi.fn()
  const consoleError = vi.spyOn(console, 'error')
  const root = hydrateRoot(container, element, { onRecoverableError })
  cleanups.push(() => {
    root.unmount()
    container.remove()
  })
  return { container, onRecoverableError, consoleError }
}

const text = (container: HTMLElement, id: string): string | null =>
  container.querySelector(`#${id}`)?.textContent ?? null

describe('hydrating server-rendered HTML in a real browser', () => {
  it('renders Web Storage defaults on the server and shows the stored values after hydration without an error', async () => {
    const local = persistentState(unique(), { default: 'default', storage: 'localStorage' })
    const session = persistentState(unique(), { default: 'default', storage: 'sessionStorage' })
    localStorage.setItem(local.key, '"stored-local"')
    sessionStorage.setItem(session.key, '"stored-session"')
    const app = (
      <>
        <Show state={local} id="local" />
        <Show state={session} id="session" />
      </>
    )
    const html = renderToString(app)
    expect(html).toContain('>default</p><p id="session">default</p>')

    const { container, onRecoverableError, consoleError } = hydrate(html, app)

    await expect
      .poll(() => [text(container, 'local'), text(container, 'session')])
      .toEqual(['stored-local', 'stored-session'])
    expect(onRecoverableError).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('renders the stored cookie on the server and leaves the DOM untouched by hydration', async () => {
    const cookie = persistentState(unique(), { default: 'default', storage: 'cookie' })
    const control = persistentState(unique(), { default: 'default', storage: 'localStorage' })
    document.cookie = `${cookie.key}=%22stored%22; path=/`
    localStorage.setItem(control.key, '"stored"')
    const app = (
      <CookieValuesProvider cookies={document.cookie}>
        <Show state={cookie} id="cookie" />
        <Show state={control} id="control" />
      </CookieValuesProvider>
    )
    const html = renderToString(app)
    expect(html).toContain('<p id="cookie">stored</p><p id="control">default</p>')

    const { container, onRecoverableError, consoleError } = hydrate(html, app)
    const cookieNode = container.querySelector('#cookie') as Element
    const observer = new MutationObserver(() => {})
    observer.observe(cookieNode, { subtree: true, childList: true, characterData: true, attributes: true })
    cleanups.push(() => observer.disconnect())

    await expect.poll(() => text(container, 'control')).toBe('stored')
    expect(cookieNode).toBe(container.querySelector('#cookie'))
    expect(cookieNode.textContent).toBe('stored')
    expect(observer.takeRecords()).toEqual([])
    expect(onRecoverableError).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('reports a mismatch, so the spies above would catch one', async () => {
    const server = persistentState(unique(), { default: 'server', storage: 'localStorage' })
    const client = persistentState(unique(), { default: 'client', storage: 'localStorage' })
    const html = renderToString(<Show state={server} id="x" />)

    const { onRecoverableError } = hydrate(html, <Show state={client} id="x" />)

    await expect.poll(() => onRecoverableError.mock.calls.length).toBeGreaterThan(0)
  })
})
