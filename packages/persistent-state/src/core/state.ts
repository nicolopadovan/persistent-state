import { type CookieAttributes, cookieNames, decodeValue, parseCookies, removeCookie, writeCookie } from './cookie'
import { type Envelope, isEnvelope, readEnvelope, writeEnvelope } from './envelope'
import { PersistentStateError, type PersistentStateErrorDetails } from './error'
import type { StandardSchemaV1 } from './standard-schema'
import type { CookieOptions, CookieSource, PersistentState, PersistentStateOptions, StorageKind } from './types'

interface Owner {
  refresh(target: StateRecord): void
  reread(target: StateRecord): boolean
}

interface StateRecord {
  storage: StorageKind
  value: unknown
  loaded: boolean
  persistent: boolean
  granted?: boolean
  unsaved?: boolean
  unavailableReported?: boolean
  owner?: Owner
  listeners: Set<() => void>
  timer?: ReturnType<typeof setTimeout>
  pendingWrite?: () => void
}

interface Registry {
  records: Map<string, StateRecord>
  available: Partial<Record<StorageKind, boolean>>
  flushing: boolean
  channel?: BroadcastChannel | null
}

interface Resolved {
  value: unknown
  migrated: boolean
}

type Lookup = (name: string) => string | undefined

const PROBE = '__persistent_state_probe__'
const CHANNEL = 'persistent-state'
const REREAD_DELAY_MS = 50
const DAY_MS = 864e5
const QUOTA_ERRORS = ['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED']

const registry = (): Registry =>
  ((globalThis as { __persistentState?: Registry }).__persistentState ??= {
    records: new Map(),
    available: {},
    flushing: false,
  })

const inBrowser = (): boolean => typeof document !== 'undefined'

const warn = (error: PersistentStateError): void => console.warn('[persistent-state]', error.message, error)

const notify = (record: StateRecord): void => record.listeners.forEach((listener) => listener())

function isAvailable(storage: StorageKind): boolean {
  return (registry().available[storage] ??= probe(storage))
}

function probe(storage: StorageKind): boolean {
  if (storage === 'cookie') return navigator.cookieEnabled
  try {
    window[storage].setItem(PROBE, PROBE)
    window[storage].removeItem(PROBE)
    return true
  } catch (error) {
    return error instanceof DOMException && QUOTA_ERRORS.includes(error.name)
  }
}

function cancel(record: StateRecord): void {
  clearTimeout(record.timer)
  record.timer = record.pendingWrite = undefined
}

function flush(record: StateRecord): void {
  const write = record.pendingWrite
  cancel(record)
  write?.()
}

function flushAll(): void {
  registry().records.forEach(flush)
}

function flushOnHide(): void {
  const current = registry()
  if (current.flushing) return
  current.flushing = true
  window.addEventListener('pagehide', flushAll)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAll()
  })
}

const follow = (record: StateRecord | undefined): boolean => record?.owner?.reread(record) ?? false

function channel(): BroadcastChannel | undefined {
  const current = registry()
  if (current.channel === undefined) {
    try {
      current.channel = new BroadcastChannel(CHANNEL)
      current.channel.onmessage = ({ data }: MessageEvent<string>) => {
        const record = current.records.get(data)
        if (record && !follow(record)) setTimeout(() => follow(record), REREAD_DELAY_MS)
      }
    } catch {
      current.channel = null
    }
  }
  return current.channel ?? undefined
}

function onStorage({ storageArea, key }: StorageEvent): void {
  if (storageArea !== window.localStorage) return
  registry().records.forEach((record, id) => {
    if (key === null ? record.storage === 'localStorage' : id === `localStorage:${key}`) follow(record)
  })
}

function onVisible(): void {
  if (document.visibilityState !== 'visible') return
  registry().records.forEach((record) => {
    if (record.storage === 'cookie') follow(record)
  })
}

function parseJson(text: string): { value: unknown } | undefined {
  try {
    return { value: JSON.parse(text) as unknown }
  } catch {
    return undefined
  }
}

const isThenable = (result: unknown): result is PromiseLike<unknown> =>
  typeof (result as { then?: unknown } | null)?.then === 'function'

const readers = new WeakMap<object, (lookup: Lookup) => unknown>()

/**
 * Declares one persisted key. Call it once at module scope, in a module both server and client code can import, and
 * export the result.
 *
 * With a `schema`, every stored value is validated on read and the value type is the schema's output type.
 *
 * @param key - The stored name, prefixed by `namespace` when one is given. Must not be empty.
 * @param options - The default value, the schema, the storage and how values are stored.
 * @returns The definition: `get`, `set`, `reset`, `subscribe` and `isPersistent` over one shared in-memory record.
 * @throws {TypeError} When `key` is empty, `version` is not an integer of 1 or more or has no `migrate`, or `expires`
 * is a negative or non-finite number or an invalid `Date`.
 *
 * @example
 * ```ts
 * export const theme = persistentState('theme', { default: 'system', storage: 'cookie', schema: ThemeSchema })
 * ```
 */
export function persistentState<T, S extends StorageKind = 'localStorage'>(
  key: string,
  options: PersistentStateOptions<NoInfer<T>, S> & { schema: StandardSchemaV1<unknown, T> },
): PersistentState<T, S>
/**
 * Declares one persisted key. Call it once at module scope, in a module both server and client code can import, and
 * export the result.
 *
 * @param key - The stored name, prefixed by `namespace` when one is given. Must not be empty.
 * @param options - The default value, the storage and how values are stored.
 * @returns The definition: `get`, `set`, `reset`, `subscribe` and `isPersistent` over one shared in-memory record.
 * @throws {TypeError} When `key` is empty, `version` is not an integer of 1 or more or has no `migrate`, or `expires`
 * is a negative or non-finite number or an invalid `Date`.
 *
 * @example
 * ```ts
 * export const theme = persistentState('theme', { default: 'system', storage: 'cookie' })
 * ```
 */
export function persistentState<T, S extends StorageKind = 'localStorage'>(
  key: string,
  options: PersistentStateOptions<T, S> & { schema?: undefined },
): PersistentState<T, S>
export function persistentState<T, S extends StorageKind = 'localStorage'>(
  key: string,
  options: PersistentStateOptions<T, S>,
): PersistentState<T, S> {
  if (!key) throw new TypeError('persistent-state: the key must be a non-empty string.')
  const { default: defaultValue, namespace, debounceMs = 0, serializer, consent, onError = warn } = options
  const { expires, schema, version, migrate } = options
  if (typeof expires === 'number' ? !(expires >= 0 && expires < Infinity) : expires && Number.isNaN(expires.getTime()))
    throw new TypeError('persistent-state: expires must be a finite number of days, 0 or more, or a valid Date.')
  if (version !== undefined && !(Number.isInteger(version) && version >= 1))
    throw new TypeError('persistent-state: version must be an integer, 1 or more.')
  if ((version === undefined) !== (migrate === undefined))
    throw new TypeError('persistent-state: version and migrate must be set together.')

  const cookie = options as CookieOptions
  const storage = options.storage ?? ('localStorage' as S)
  const fullKey = namespace ? `${namespace}:${key}` : key
  const id = `${storage}:${fullKey}`
  const syncs = (options.sync ?? true) && storage !== 'sessionStorage'

  const webStorage = (): Storage => window[storage as Exclude<StorageKind, 'cookie'>]

  const report = (code: PersistentStateError['code'], details?: PersistentStateErrorDetails): void => {
    try {
      onError(new PersistentStateError(code, fullKey, details))
    } catch (error) {
      console.error('[persistent-state]', `"${fullKey}": onError threw`, error)
    }
  }

  const unstored: Resolved = { value: defaultValue, migrated: false }

  const record = (): StateRecord => {
    const records = registry().records
    let found = records.get(id)
    if (!found) {
      records.set(id, (found = { storage, value: defaultValue, loaded: false, persistent: true, listeners: new Set() }))
      window.addEventListener('storage', onStorage)
      document.addEventListener('visibilitychange', onVisible)
      if (storage === 'cookie') channel()
    }
    found.owner = owner
    return found
  }

  const consented = (): boolean => {
    if (!consent) return true
    try {
      return Boolean(consent())
    } catch (error) {
      console.error('[persistent-state]', `"${fullKey}": consent threw, so it counts as no consent`, error)
      return false
    }
  }

  const checkConsent = (target: StateRecord): boolean => (target.granted = consented())

  const cookieAttributes = (): CookieAttributes => {
    const days = expires ?? 365
    return {
      expires: typeof days !== 'number' ? days : days ? new Date(Date.now() + days * DAY_MS) : undefined,
      path: cookie.path ?? '/',
      domain: cookie.domain,
      secure: cookie.secure ?? location.protocol === 'https:',
      sameSite: cookie.sameSite ?? 'lax',
    }
  }

  const malformed = (): undefined => {
    report('parse-failed')
    return undefined
  }

  const decode = (text: string, decodePasses: number): Envelope | undefined => {
    if (serializer) {
      try {
        const parsed = parseJson(text)
        if (!parsed || !isEnvelope(parsed.value)) return { v: serializer.deserialize(text), ver: 0 }
        const envelope = readEnvelope(parsed.value)
        if (!envelope) return malformed()
        if (envelope.ver === Infinity) return envelope
        if (typeof envelope.v !== 'string') return malformed()
        return { ...envelope, v: serializer.deserialize(envelope.v) }
      } catch (error) {
        report('parse-failed', { cause: error })
        return undefined
      }
    }
    let candidate: string | undefined = text
    for (let pass = 0; candidate !== undefined && pass <= decodePasses; pass++) {
      const parsed = parseJson(candidate)
      if (!parsed) {
        if (pass < decodePasses) candidate = decodeValue(candidate)
        continue
      }
      if (isEnvelope(parsed.value)) return readEnvelope(parsed.value) ?? malformed()
      return { v: typeof defaultValue === 'string' && typeof parsed.value !== 'string' ? text : parsed.value, ver: 0 }
    }
    return candidate === undefined ? malformed() : { v: text, ver: 0 }
  }

  const resolve = (stored: Envelope): Resolved => {
    if (stored.ver > (version ?? 0)) {
      report('version-ahead')
      return unstored
    }
    if (storage !== 'cookie' && stored.exp !== undefined && stored.exp <= Date.now()) {
      remove()
      return unstored
    }
    let value = stored.v
    const migrated = migrate !== undefined && stored.ver < (version ?? 0)
    if (migrated) {
      try {
        value = migrate(value, stored.ver)
        if (value === undefined) throw new TypeError('migrate returned undefined')
      } catch (error) {
        report('migrate-failed', { cause: error })
        return unstored
      }
    }
    if (schema) {
      let result: ReturnType<StandardSchemaV1['~standard']['validate']>
      try {
        result = schema['~standard'].validate(value)
      } catch (error) {
        report('invalid', { cause: error })
        return unstored
      }
      if (isThenable(result)) {
        void Promise.resolve(result).catch(() => {})
        report('async-schema')
        return unstored
      }
      if (!result || result.issues) {
        report('invalid', { issues: result?.issues })
        return unstored
      }
      value = result.value
    }
    return { value, migrated }
  }

  const resolveText = (text: string, decodePasses: number): Resolved => {
    const stored = decode(text, decodePasses)
    return stored ? resolve(stored) : unstored
  }

  const readCookie = (lookup: Lookup): Resolved => {
    for (const name of cookieNames(fullKey)) {
      const text = lookup(name)
      if (text !== undefined) return resolveText(text, 2)
    }
    return unstored
  }

  const readStorage = (): Resolved => {
    if (storage === 'cookie') {
      const jar = parseCookies(document.cookie)
      return readCookie((name) => jar.get(name))
    }
    const text = webStorage().getItem(fullKey)
    return text === null ? unstored : resolveText(text, 0)
  }

  const expiry = (): number | undefined => {
    if (storage === 'cookie' || !expires) return undefined
    return typeof expires === 'number' ? Date.now() + expires * DAY_MS : expires.getTime()
  }

  const encode = (value: T): string => {
    const payload = serializer ? serializer.serialize(value) : value
    const exp = expiry()
    if (version === undefined && exp === undefined) return serializer ? (payload as string) : JSON.stringify(payload)
    return writeEnvelope(payload, version ?? 0, exp)
  }

  const store = (value: T): boolean => {
    try {
      const text = encode(value)
      if (storage !== 'cookie') {
        webStorage().setItem(fullKey, text)
        return true
      }
      if (writeCookie(fullKey, text, cookieAttributes())) {
        channel()?.postMessage(id)
        return true
      }
      report('write-failed')
      return false
    } catch (error) {
      report('write-failed', { cause: error })
      return false
    }
  }

  const read = (target: StateRecord): void => {
    let cause: unknown
    try {
      if (isAvailable(storage)) {
        const { value, migrated } = readStorage()
        target.value = value
        target.persistent = !migrated || (consented() && store(value as T))
        return
      }
    } catch (error) {
      cause = error
    }
    target.persistent = false
    if (!target.unavailableReported) report('unavailable', { cause })
    target.unavailableReported = true
  }

  const load = (target: StateRecord): void => {
    target.loaded = true
    if (checkConsent(target)) read(target)
    else target.persistent = false
  }

  const reload = (target: StateRecord): boolean => {
    const { value, persistent } = target
    read(target)
    const changed = !Object.is(target.value, value) || target.persistent !== persistent
    if (changed) notify(target)
    return changed
  }

  const setPersistent = (target: StateRecord, persistent: boolean): void => {
    if (target.persistent === persistent) return
    target.persistent = persistent
    notify(target)
  }

  const write = (target: StateRecord, value: T): void => {
    const stored = checkConsent(target) && isAvailable(storage) && store(value)
    if (stored) target.unsaved = false
    setPersistent(target, stored)
  }

  const remove = (): void => {
    if (!isAvailable(storage)) return
    if (storage === 'cookie') {
      removeCookie(fullKey, cookieAttributes())
      channel()?.postMessage(id)
    } else webStorage().removeItem(fullKey)
  }

  const refresh = (target: StateRecord): void => {
    const granted = target.granted
    if (!target.loaded || checkConsent(target) === granted) return
    if (!target.granted) setPersistent(target, false)
    else if (target.unsaved) write(target, target.value as T)
    else reload(target)
  }

  const reread = (target: StateRecord): boolean =>
    syncs && target.loaded && target.persistent && !target.pendingWrite && consented() && reload(target)

  const owner: Owner = { refresh, reread }

  const assertBrowser = (): void => {
    if (!inBrowser())
      throw new Error(
        `persistent-state: "${fullKey}" can only be changed in the browser. On the server, read cookie state with readState(); Server Actions cannot write it yet.`,
      )
  }

  const get = (): T => {
    if (!inBrowser()) return defaultValue
    const target = record()
    if (!target.loaded) load(target)
    return target.value as T
  }

  const reset = (): void => {
    assertBrowser()
    get()
    const target = record()
    cancel(target)
    target.value = defaultValue
    target.unsaved = false
    notify(target)
    remove()
  }

  const definition: PersistentState<T, S> = {
    key: fullKey,
    storage,
    defaultValue,
    get,
    set(next) {
      assertBrowser()
      const previous = get()
      const value = typeof next === 'function' ? (next as (prev: T) => T)(previous) : next
      if (value === undefined) return reset()
      if (Object.is(value, previous)) return
      const target = record()
      target.value = value
      target.unsaved = true
      notify(target)
      cancel(target)
      if (debounceMs > 0) {
        target.pendingWrite = () => write(target, value)
        target.timer = setTimeout(() => flush(target), debounceMs)
        flushOnHide()
      } else {
        write(target, value)
      }
    },
    reset,
    subscribe(listener) {
      if (!inBrowser()) return () => {}
      const { listeners } = record()
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    isPersistent() {
      if (!inBrowser()) return false
      get()
      return record().persistent
    },
  }
  readers.set(definition, storage === 'cookie' ? (lookup) => readCookie(lookup).value : () => defaultValue)
  return definition
}

/**
 * Re-evaluates the `consent` predicate of every definition used in this page. When a predicate has changed to `true`,
 * a value set in memory since is written; otherwise the stored value is read and subscribers are notified. When it has
 * changed to `false`, the value stays in memory and `isPersistent` becomes `false`. Stored items are never deleted;
 * call `reset()` on a definition to remove its item. Does nothing on the server.
 *
 * @example
 * ```ts
 * analytics.consent.subscribe(({ consent }) => {
 *   if (!consent?.preferences) theme.reset()
 *   refreshConsent()
 * })
 * ```
 */
export function refreshConsent(): void {
  registry().records.forEach((record) => record.owner?.refresh(record))
}

/**
 * Reads a cookie definition from request cookies, in any server runtime. It does not write and does not evaluate a
 * consent predicate. In Next.js, use `readState` from `@nicolopadovan/persistent-state/next`.
 *
 * @param definition - A definition created by {@link persistentState} with `storage: 'cookie'`.
 * @param cookies - The request's cookies: a {@link CookieSource} such as Next.js's `cookies()`, or a `Cookie` header.
 * @returns The stored value, or the definition's default when no cookie holds it.
 * @throws {TypeError} When `definition` was not created by {@link persistentState}.
 */
export function readCookieState<T>(definition: PersistentState<T, 'cookie'>, cookies: CookieSource | string): T {
  const read = readers.get(definition)
  if (!read) throw new TypeError('persistent-state: readCookieState() needs a definition from persistentState().')
  if (typeof cookies !== 'string') return read((name) => cookies.get(name)?.value) as T
  const jar = parseCookies(cookies)
  return read((name) => jar.get(name)) as T
}
