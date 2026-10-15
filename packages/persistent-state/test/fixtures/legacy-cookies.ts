// Copied from 0.2.1 (src/cookies.ts at 1005a69) to prove cookies written by 0.3.0 stay readable by it.
export type PersistentCookieStore = {
  get(name: string): { value: string } | undefined
}

function getPersistentCookieValue(cookieStore: PersistentCookieStore, key: string): string | undefined {
  const encodedKey = encodeURIComponent(key)
  const doubleEncodedKey = encodeURIComponent(encodedKey)

  return cookieStore.get(key)?.value ?? cookieStore.get(encodedKey)?.value ?? cookieStore.get(doubleEncodedKey)?.value
}

export function getPersistentCookieItem<T>(cookieStore: PersistentCookieStore, key: string): T | undefined {
  const rawValue = getPersistentCookieValue(cookieStore, key)
  if (!rawValue) {
    return undefined
  }

  const candidates = [rawValue, decodeURIComponent(rawValue), decodeURIComponent(decodeURIComponent(rawValue))]

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T
    } catch {
      continue
    }
  }

  return undefined
}

export function nextCookieStore(header: string): PersistentCookieStore {
  const map = new Map<string, string>()
  for (const pair of header.split(/; */)) {
    const at = pair.indexOf('=')
    if (at === -1) continue
    try {
      map.set(pair.slice(0, at), decodeURIComponent(pair.slice(at + 1)))
    } catch {
      continue
    }
  }
  return { get: (name) => (map.has(name) ? { value: map.get(name)! } : undefined) }
}
