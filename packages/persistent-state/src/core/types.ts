import type { PersistentStateError } from './error'
import type { StandardSchemaV1 } from './standard-schema'

/** Where a value is stored. Only `'cookie'` is readable on the server. */
export type StorageKind = 'cookie' | 'localStorage' | 'sessionStorage'

/** Converts values to and from the text that is stored. */
export interface Serializer<T> {
  /** Turns a value into the stored text. */
  serialize(value: T): string
  /** Turns stored text back into a value. A throw is reported as `parse-failed` and the default is used. */
  deserialize(text: string): unknown
}

/** Attributes of the cookie a `'cookie'` definition writes. Each one is applied on every write. */
export interface CookieOptions {
  /** The cookie's `Path`. Defaults to `'/'`. */
  path?: string
  /** The cookie's `Domain`. Defaults to none, which limits the cookie to the current host. */
  domain?: string
  /** Whether the cookie is sent only over HTTPS. Defaults to `true` on `https:` pages. */
  secure?: boolean
  /** The cookie's `SameSite` attribute. Defaults to `'lax'`. */
  sameSite?: 'strict' | 'lax' | 'none'
}

type CookieOnlyOptions = { [K in keyof CookieOptions]?: never }

/** Options that apply to every storage. */
interface CommonOptions<T, S extends StorageKind> {
  /** The value used when nothing valid is stored. Treated as immutable. Required. */
  default: T
  /** Where the value is stored. Defaults to `'localStorage'`. Only `'cookie'` is readable on the server. */
  storage?: S
  /** A prefix for the stored name, which becomes `` `${namespace}:${key}` ``. */
  namespace?: string
  /** Delays storage writes by this many milliseconds; memory and subscribers update at once. Defaults to `0`. */
  debounceMs?: number
  /** Converts values to and from the stored text. Defaults to JSON. */
  serializer?: Serializer<T>
  /**
   * When the stored value expires: a number of days counted from each write, or a fixed date. A cookie gets this as
   * its `Expires` attribute, `365` days by default, and `0` writes a session cookie. In `localStorage` and
   * `sessionStorage` the value is stored in an envelope with its expiry and removed on the first read after it; `0` or
   * no value means it never expires. A negative or non-finite number, or an invalid `Date`, throws a `TypeError` in
   * `persistentState`.
   */
  expires?: number | Date
  /**
   * A Standard Schema (zod, valibot, arktype, ...) that checks every stored value on read. A value it rejects is
   * reported as `invalid` and the default is used; reads leave the stored item untouched, `set()` replaces it and
   * `reset()` removes it. The schema must validate synchronously: a schema that returns a promise is reported as
   * `async-schema`. The output type of the schema is the type of the value.
   */
  schema?: StandardSchemaV1<unknown, T>
  /**
   * The version of the stored value, an integer of `1` or more. A value stored under a lower version, or under none,
   * is passed to `migrate`; a value stored under a higher version is reported as `version-ahead`, the default is used
   * and reads leave the stored item untouched, while `set()` replaces it and `reset()` removes it. Requires `migrate`.
   */
  version?: number
  /**
   * Converts a value stored under an older version to the current one. Receives the stored value and the version it
   * was stored under, `0` for a value stored without a version. The result is validated by `schema` and written back
   * once. A throw, or a result of `undefined`, is reported as `migrate-failed` and the default is used; reads leave the
   * stored item untouched, `set()` replaces it and `reset()` removes it. Requires `version`.
   */
  migrate?: (stored: unknown, fromVersion: number) => T
  /**
   * Follows changes made in other tabs: `localStorage` through `storage` events, cookies through a `BroadcastChannel`
   * and a re-read when the tab becomes visible. Defaults to `true`. `sessionStorage` and values held only in memory
   * are never synced.
   */
  sync?: boolean
  /**
   * Whether storing is allowed. While it returns `false`, storage is neither read nor written, the value lives in
   * memory and `isPersistent` is `false`; `reset()` still removes the stored item. Evaluated on first use, before
   * every write and by `refreshConsent()`. A throw counts as `false` and is logged. Defaults to always allowed.
   */
  consent?: () => boolean
  /**
   * Receives every storage failure. Defaults to a `console.warn` prefixed with `[persistent-state]`. A handler that
   * throws is caught and logged with `console.error`.
   */
  onError?: (error: PersistentStateError) => void
}

/**
 * The options of {@link persistentState}. The cookie attributes of {@link CookieOptions} are accepted only when
 * `storage` is `'cookie'`.
 */
export type PersistentStateOptions<T, S extends StorageKind = 'localStorage'> = CommonOptions<T, S> &
  (S extends 'cookie' ? CookieOptions : CookieOnlyOptions)

/** A persisted key declared once with {@link persistentState}. */
export interface PersistentState<T, S extends StorageKind = StorageKind> {
  /** The full stored name, namespace included. */
  readonly key: string
  /** Where the value is stored. */
  readonly storage: S
  /** The value used when nothing valid is stored. */
  readonly defaultValue: T
  /**
   * Returns the current value. The first call in a page reads storage; later calls return the cached value, so
   * objects keep their identity. On the server it returns the default.
   */
  get(): T
  /**
   * Updates the value in memory, notifies subscribers, then writes it to storage. A value `Object.is`-equal to the
   * current one does nothing; `undefined` is the same as {@link PersistentState.reset}. Throws on the server.
   */
  set(next: T | ((prev: T) => T)): void
  /**
   * Sets the value back to the default, notifies subscribers and removes the stored item, including every legacy
   * cookie name. Throws on the server.
   */
  reset(): void
  /** Calls `listener` when the value or {@link PersistentState.isPersistent} changes. Returns the unsubscribe. */
  subscribe(listener: () => void): () => void
  /** Whether the value is being stored. `false` while it lives only in memory, and on the server. */
  isPersistent(): boolean
}

/** Read access to request cookies, shaped like the cookie store of Next.js's `cookies()`. */
export interface CookieSource {
  /** Returns the cookie with exactly this name, its value URI-decoded once, or `undefined`. */
  get(name: string): { value: string } | undefined
}
