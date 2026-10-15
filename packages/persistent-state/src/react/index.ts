import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from 'react'
import { cookieNames, parseCookies } from '../core/cookie'
import { persistentState, readCookieState } from '../core/state'
import type { PersistentState, PersistentStateOptions, StorageKind } from '../core/types'

interface CookieValues {
  jar: Map<string, string>
  listed?: ReadonlySet<string>
  snapshots: WeakMap<object, unknown>
}

const CookieValuesContext = createContext<CookieValues | null>(null)

const warned = new Set<string>()

const alwaysPersistent = (): boolean => true

function serverCookieValue<T>(definition: PersistentState<T, 'cookie'>, { jar, listed }: CookieValues): T {
  if (
    typeof document === 'undefined' &&
    process.env.NODE_ENV !== 'production' &&
    !warned.has(definition.key) &&
    !(listed ? listed.has(definition.key) : cookieNames(definition.key).some((name) => jar.has(name)))
  ) {
    warned.add(definition.key)
    console.warn(
      `[persistent-state] "${definition.key}" is a cookie definition rendered on the server, but the CookieValuesProvider above it holds no cookie for it, so it renders its default. List it in PersistentStateProvider's states.`,
    )
  }
  return readCookieState(definition, {
    get: (name) => {
      const value = jar.get(name)
      return value === undefined ? undefined : { value }
    },
  })
}

/** The props of {@link CookieValuesProvider}. */
export interface CookieValuesProviderProps {
  /**
   * The request's cookies: a record of cookie names to values URI-decoded once, as Next.js's `cookies()` returns them,
   * or a raw `Cookie` header.
   */
  cookies: Record<string, string> | string
  /**
   * The stored names (`definition.key`) of the cookie definitions the provider covers. When given, only definitions
   * missing from it log the development warning for a cookie the provider does not hold, so a covered definition whose
   * cookie the visitor does not have yet stays quiet. `PersistentStateProvider` sets it.
   */
  listed?: readonly string[]
  /** The tree that renders cookie definitions. */
  children?: ReactNode
}

/**
 * Supplies the request's cookie values for server rendering and hydration, so cookie definitions render their stored
 * value on the server and hydrate without a mismatch. Render it with the same `cookies` on the server and the client.
 * In Next.js, render `PersistentStateProvider` from `@nicolopadovan/persistent-state/next` instead.
 *
 * @example
 * ```tsx
 * <CookieValuesProvider cookies={request.headers.get('cookie') ?? ''}>
 *   <App />
 * </CookieValuesProvider>
 * ```
 */
export function CookieValuesProvider({ cookies, listed, children }: CookieValuesProviderProps): ReactElement {
  const value = useMemo<CookieValues>(
    () => ({
      jar: typeof cookies === 'string' ? parseCookies(cookies) : new Map(Object.entries(cookies)),
      listed: listed && new Set(listed),
      snapshots: new WeakMap(),
    }),
    [cookies, listed],
  )
  return createElement(CookieValuesContext.Provider, { value }, children)
}

/** The third element of the tuple returned by {@link useStoredState} and {@link usePersistentState}. */
export interface StoredStateMeta {
  /** Sets the value back to the default and removes the stored item. Stable across renders. */
  reset: () => void
  /** Whether the value is being stored. `true` during server rendering and hydration, then the real state. */
  isPersistent: boolean
}

/**
 * Uses a definition from `persistentState` in a component. Every component using a definition with the same storage
 * and key shares one value and re-renders together.
 *
 * During server rendering and hydration, Web Storage definitions render their default and cookie definitions the
 * value from the nearest {@link CookieValuesProvider} (or their default without one), so hydration never mismatches.
 * The stored value follows right after hydration.
 *
 * @param definition - A definition created by `persistentState`.
 * @returns The value, a setter accepting a value or an updater, and {@link StoredStateMeta}. The setter and `reset`
 *   keep their identity across renders.
 *
 * @example
 * ```tsx
 * const [theme, setTheme, { reset }] = useStoredState(themeState)
 * ```
 */
export function useStoredState<T, S extends StorageKind>(
  definition: PersistentState<T, S>,
): [value: T, setValue: (next: T | ((prev: T) => T)) => void, meta: StoredStateMeta] {
  const cookies = useContext(CookieValuesContext)
  const getServerSnapshot = useCallback((): T => {
    if (definition.storage !== 'cookie' || !cookies) return definition.defaultValue
    if (!cookies.snapshots.has(definition))
      cookies.snapshots.set(definition, serverCookieValue(definition as PersistentState<T, 'cookie'>, cookies))
    return cookies.snapshots.get(definition) as T
  }, [definition, cookies])
  const subscribe = useCallback((listener: () => void) => definition.subscribe(listener), [definition])
  const value = useSyncExternalStore(subscribe, () => definition.get(), getServerSnapshot)
  const isPersistent = useSyncExternalStore(subscribe, () => definition.isPersistent(), alwaysPersistent)
  const setValue = useCallback((next: T | ((prev: T) => T)) => definition.set(next), [definition])
  const reset = useCallback(() => definition.reset(), [definition])
  const meta = useMemo(() => ({ reset, isPersistent }), [reset, isPersistent])
  return [value, setValue, meta]
}

/** The options of {@link usePersistentState}: every `persistentState` option except `default`. */
export type UsePersistentStateOptions<T, S extends StorageKind = 'localStorage'> = Omit<
  PersistentStateOptions<T, S>,
  'default'
> & {
  /** @deprecated Use `storage`. Removed in 1.0.0. */
  storageType?: S
  /** @deprecated Use `sync`. Removed in 1.0.0. */
  syncAcrossTabs?: boolean
}

/**
 * Persists state for a one-off key without declaring it with `persistentState`. Prefer a definition for keys used in
 * more than one place or read on the server.
 *
 * @param key - The stored name, prefixed by `namespace` when one is given.
 * @param initial - The default value, or a function returning it, called once.
 * @param options - Every `persistentState` option except `default`.
 * @returns The same tuple as {@link useStoredState}.
 *
 * @example
 * ```tsx
 * const [open, setOpen] = usePersistentState('sidebar-open', true)
 * ```
 */
export function usePersistentState<T, S extends StorageKind = 'localStorage'>(
  key: string,
  initial: T | (() => T),
  options?: UsePersistentStateOptions<T, S>,
): [value: T, setValue: (next: T | ((prev: T) => T)) => void, meta: StoredStateMeta] {
  const { storageType, syncAcrossTabs, ...rest } = options ?? ({} as UsePersistentStateOptions<T, S>)
  const storage = rest.storage ?? storageType ?? ('localStorage' as S)
  const fullKey = rest.namespace ? `${rest.namespace}:${key}` : key
  const definition = useRef<PersistentState<T, S> | null>(null)
  if (definition.current?.key !== fullKey || definition.current.storage !== storage) {
    const legacy = syncAcrossTabs === undefined ? {} : { sync: syncAcrossTabs }
    definition.current = persistentState<T, S>(key, {
      ...legacy,
      ...rest,
      storage,
      default: typeof initial === 'function' ? (initial as () => T)() : initial,
    } as PersistentStateOptions<T, S> & { schema?: undefined })
  }
  return useStoredState(definition.current)
}
