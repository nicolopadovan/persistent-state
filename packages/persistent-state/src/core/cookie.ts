/** The attributes every cookie write carries. */
export interface CookieAttributes {
  /** When the cookie expires; a session cookie when absent. */
  expires?: Date
  /** The cookie's `Path`. */
  path: string
  /** The cookie's `Domain`, if any. */
  domain?: string
  /** Whether the cookie carries `Secure`. */
  secure: boolean
  /** The cookie's `SameSite`. */
  sameSite: 'strict' | 'lax' | 'none'
}

const encodeName = (name: string): string =>
  encodeURIComponent(name)
    .replace(/%(2[346B]|5E|60|7C)/g, decodeURIComponent)
    .replaceAll('(', '%28')
    .replaceAll(')', '%29')

const encodeValue = (value: string): string =>
  encodeURIComponent(value).replace(/%(2[346BF]|3[AC-F]|40|5[BDE]|60|7[BCD])/g, decodeURIComponent)

/** Decodes percent-escapes as js-cookie's read converter does, or returns `undefined` when one is not valid UTF-8. */
export function decodeValue(value: string): string | undefined {
  try {
    return value.replace(/(%[\dA-F]{2})+/gi, decodeURIComponent)
  } catch {
    return undefined
  }
}

const isSafeName = (name: string): boolean => /^[\x21-\x7E]+$/.test(name) && !/[",;=\\]/.test(name)

const attribute = (value: string): string => value.split(';')[0]

/**
 * Every name a key may be stored under, the canonical js-cookie encoding first, then the raw key and its single and
 * double `encodeURIComponent` forms written by older versions. Names that cannot be a cookie name are left out.
 */
export function cookieNames(key: string): string[] {
  const encoded = encodeURIComponent(key)
  return [...new Set([encodeName(key), key, encoded, encodeURIComponent(encoded)])].filter(isSafeName)
}

/**
 * Parses a `Cookie` header or `document.cookie` into names, kept as written, and values URI-decoded once as js-cookie
 * reads them. Unlike js-cookie, surrounding double quotes are kept, as Next.js's request cookies keep them, so a value
 * decodes the same on the server and in the browser. The first cookie of a name wins; a value that does not decode is
 * kept as written.
 */
export function parseCookies(header: string): Map<string, string> {
  const jar = new Map<string, string>()
  for (const pair of header.split(/; */)) {
    const at = pair.indexOf('=')
    const name = pair.slice(0, at)
    if (at < 1 || jar.has(name)) continue
    const value = pair.slice(at + 1)
    jar.set(name, decodeValue(value) ?? value)
  }
  return jar
}

const serializeCookie = (name: string, value: string, attributes: CookieAttributes): string =>
  `${name}=${value}; path=${attribute(attributes.path)}` +
  (attributes.expires ? `; expires=${attributes.expires.toUTCString()}` : '') +
  `; samesite=${attributes.sameSite}` +
  (attributes.domain ? `; domain=${attribute(attributes.domain)}` : '') +
  (attributes.secure ? '; secure' : '')

/** Writes `text` under the canonical name of `key` and returns whether it reads back from `document.cookie`. */
export function writeCookie(key: string, text: string, attributes: CookieAttributes): boolean {
  const name = encodeName(key)
  document.cookie = serializeCookie(name, encodeValue(text), attributes)
  return parseCookies(document.cookie).get(name) === text
}

/** Expires the cookie of `key` under every name in {@link cookieNames}. */
export function removeCookie(key: string, attributes: CookieAttributes): void {
  for (const name of cookieNames(key)) {
    document.cookie = serializeCookie(name, '', { ...attributes, expires: new Date(0) })
  }
}
