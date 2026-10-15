import { cookies } from 'next/headers.js'
import type { ReactElement, ReactNode } from 'react'
import { CookieValuesProvider } from '@nicolopadovan/persistent-state/react'
import { cookieNames } from './core/cookie'
import { readCookieState } from './core/state'
import type { PersistentState } from './core/types'

/** The props of {@link PersistentStateProvider}. */
export interface PersistentStateProviderProps {
  /** The cookie definitions whose stored values the first render needs. Only their cookies reach the client. */
  states: readonly Pick<PersistentState<unknown, 'cookie'>, 'key' | 'storage'>[]
  /** The tree that renders those definitions. */
  children?: ReactNode
}

/**
 * Reads a cookie definition in a Server Component, Server Action or Route Handler: the value is decoded, as
 * `useStoredState` decodes it in the browser, or the default when the visitor has no cookie for it. Only definitions
 * with `storage: 'cookie'` are accepted. Like every `cookies()` call, it makes the route dynamic.
 *
 * @param definition - A definition created by `persistentState` with `storage: 'cookie'`.
 * @returns The stored value, or the definition's default.
 *
 * @example
 * ```tsx
 * const theme = await readState(themeState)
 * ```
 */
export async function readState<T>(definition: PersistentState<T, 'cookie'>): Promise<T> {
  return readCookieState(definition, await cookies())
}

/**
 * A Server Component that makes the stored values of cookie definitions available to server rendering and
 * hydration, so they render without a flash of their default. It reads only the cookies of the listed definitions,
 * under every name an older version may have written them, and renders `CookieValuesProvider` with them; other
 * cookies never reach the client. Like every `cookies()` call, it makes the route dynamic, so render it in the
 * layout that needs it.
 *
 * @example
 * ```tsx
 * <PersistentStateProvider states={[themeState]}>{children}</PersistentStateProvider>
 * ```
 */
export async function PersistentStateProvider({
  states,
  children,
}: PersistentStateProviderProps): Promise<ReactElement> {
  const store = await cookies()
  const values: Record<string, string> = {}
  for (const { key } of states) {
    for (const name of cookieNames(key)) {
      const value = store.get(name)?.value
      if (value !== undefined) values[name] = value
    }
  }
  return (
    <CookieValuesProvider cookies={values} listed={states.map(({ key }) => key)}>
      {children}
    </CookieValuesProvider>
  )
}
