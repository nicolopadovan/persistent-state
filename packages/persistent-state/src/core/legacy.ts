import { decodeValue } from './cookie'
import type { CookieSource, StorageKind } from './types'

/** @deprecated Use {@link CookieSource}. Removed in 1.0.0. */
export type PersistentCookieStore = CookieSource

/** @deprecated Use {@link StorageKind}. Removed in 1.0.0. */
export type StorageType = StorageKind

/**
 * Returns the raw value of the cookie stored for `key`, under its raw, encoded or double-encoded name.
 *
 * @deprecated Use `readCookieState` with a definition from `persistentState`. Removed in 1.0.0.
 */
export function getPersistentCookieValue(cookieStore: PersistentCookieStore, key: string): string | undefined {
  const encodedKey = encodeURIComponent(key)
  const doubleEncodedKey = encodeURIComponent(encodedKey)

  return cookieStore.get(key)?.value ?? cookieStore.get(encodedKey)?.value ?? cookieStore.get(doubleEncodedKey)?.value
}

/**
 * Returns the JSON value of the cookie stored for `key`, trying the value as is, then URI-decoded once and twice.
 * Returns `undefined` when no cookie is found or none of the forms is JSON.
 *
 * @deprecated Use `readCookieState` with a definition from `persistentState`. Removed in 1.0.0.
 */
export function getPersistentCookieItem<T>(cookieStore: PersistentCookieStore, key: string): T | undefined {
  const rawValue = getPersistentCookieValue(cookieStore, key)
  if (!rawValue) {
    return undefined
  }

  let candidate: string | undefined = rawValue
  for (let pass = 0; candidate !== undefined && pass < 3; pass++) {
    try {
      return JSON.parse(candidate) as T
    } catch {
      candidate = decodeValue(candidate)
    }
  }

  return undefined
}
