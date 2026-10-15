import { describe, expect, it, vi } from 'vitest'
import { persistentState, type CookieOptions } from '../../src/index'

const DAY_MS = 864e5

let count = 0
const unique = (): string => `cookies-${(count += 1)}-${Math.random().toString(36).slice(2)}`

const newPage = (): void => {
  delete (globalThis as { __persistentState?: unknown }).__persistentState
}

const cookieNames = (): string[] => document.cookie.split('; ').map((pair) => pair.slice(0, pair.indexOf('=')))

interface StoredCookie {
  path: string
  sameSite: string
  secure: boolean
  expires: number | null
}

const storedCookie = async (name: string): Promise<StoredCookie | undefined> =>
  ((await cookieStore.get(name)) ?? undefined) as StoredCookie | undefined

const expiresInDays = (expires: number | null | undefined, days: number): boolean =>
  typeof expires === 'number' && Math.abs(expires - (Date.now() + days * DAY_MS)) < 60_000

describe('cookies written to the real jar', () => {
  it('shows the encoded value in document.cookie and reads it back on a new page', () => {
    const key = unique()
    persistentState(key, { default: {}, storage: 'cookie' }).set({ n: 1, text: 'a; b=c é,' })

    expect(document.cookie).toContain(`${key}={%22n%22:1%2C%22text%22:%22a%3B%20b=c%20%C3%A9%2C%22}`)

    newPage()
    expect(persistentState(key, { default: {}, storage: 'cookie' }).get()).toEqual({ n: 1, text: 'a; b=c é,' })
  })

  it.each([
    ['one year by default', undefined, 365],
    ['the given number of days', 2, 2],
  ])('expires after %s', async (_label, expires, days) => {
    const key = unique()
    persistentState(key, { default: 'a', storage: 'cookie', expires }).set('b')

    expect(expiresInDays((await storedCookie(key))?.expires, days)).toBe(true)
  })

  it('is a session cookie with expires: 0', async () => {
    const key = unique()
    persistentState(key, { default: 'a', storage: 'cookie', expires: 0 }).set('b')

    expect(await storedCookie(key)).toMatchObject({ expires: null })
  })

  it.each<[Partial<CookieOptions>, { path: string; sameSite: string; secure: boolean }]>([
    [{}, { path: '/', sameSite: 'lax', secure: false }],
    [{ sameSite: 'strict' }, { path: '/', sameSite: 'strict', secure: false }],
    [
      { sameSite: 'none', secure: true },
      { path: '/', sameSite: 'none', secure: true },
    ],
  ])('carries the attributes of %j', async (options, expected) => {
    const key = unique()
    persistentState(key, { default: 'a', storage: 'cookie', ...options }).set('b')

    expect(await storedCookie(key)).toMatchObject(expected)
  })

  it('reports write-failed when the path hides the cookie from the page', async () => {
    const key = unique()
    const onError = vi.fn()
    const state = persistentState(key, { default: 'a', storage: 'cookie', path: '/elsewhere', onError })

    state.set('b')

    expect(onError.mock.calls.map(([error]) => (error as { code: string }).code)).toEqual(['write-failed'])
    expect(state.isPersistent()).toBe(false)
    expect(state.get()).toBe('b')
    await cookieStore.delete({ name: key, path: '/elsewhere' })
  })

  it('reports write-failed for a cookie over the size limit and keeps the value in memory', () => {
    const key = unique()
    const onError = vi.fn()
    const state = persistentState(key, { default: 'a', storage: 'cookie', onError })

    state.set('x'.repeat(5000))

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0]?.[0]).toMatchObject({ code: 'write-failed', key })
    expect(state.isPersistent()).toBe(false)
    expect(state.get()).toBe('x'.repeat(5000))
    expect(cookieNames()).not.toContain(key)
  })
})

describe('legacy cookie names', () => {
  const variants = (fullKey: string): string[] => [
    fullKey,
    encodeURIComponent(fullKey),
    encodeURIComponent(encodeURIComponent(fullKey)),
  ]
  const write = (name: string): string => (document.cookie = `${name}=${encodeURIComponent('"legacy"')}; path=/`)

  it.each([0, 1, 2])('reads the name variant %i and reset removes it', (variant) => {
    const key = unique()
    const name = variants(`ns:${key}`)[variant]
    const state = persistentState(key, { default: 'a', storage: 'cookie', namespace: 'ns' })
    write(name)

    expect(state.get()).toBe('legacy')
    expect(cookieNames()).toContain(name)

    state.reset()

    expect(state.get()).toBe('a')
    expect(cookieNames()).not.toContain(name)
  })

  it('removes every name variant on reset', () => {
    const key = unique()
    const names = variants(`ns:${key}`)
    const state = persistentState(key, { default: 'a', storage: 'cookie', namespace: 'ns' })
    names.forEach(write)

    state.reset()

    expect(cookieNames().filter((name) => names.includes(name))).toEqual([])
  })
})
