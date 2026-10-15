import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getPersistentCookieItem,
  getPersistentCookieValue,
  persistentState,
  readCookieState,
} from '@nicolopadovan/persistent-state'
import { getPersistentCookieItem as getPersistentCookieItem021, nextCookieStore } from './fixtures/legacy-cookies'
import { resetEnvironment } from './helpers'

const KEY = 'my:key'
const OBJECT = { a: 1, s: 'x y;z' }
const JSON_TEXT = JSON.stringify(OBJECT)

const NAMES = {
  raw: KEY,
  encoded: encodeURIComponent(KEY),
  'double-encoded': encodeURIComponent(encodeURIComponent(KEY)),
}

const VALUES = {
  'js-cookie encoded': '{%22a%22:1%2C%22s%22:%22x%20y%3Bz%22}',
  'URI-encoded': encodeURIComponent(JSON_TEXT),
  'double URI-encoded': encodeURIComponent(encodeURIComponent(JSON_TEXT)),
}

const definition = () => persistentState(KEY, { default: { a: 0, s: '' }, storage: 'cookie' })

beforeEach(resetEnvironment)

describe('cookies written by 0.2.1', () => {
  describe.each(Object.entries(NAMES))('under the %s name', (_, name) => {
    it.each(Object.entries(VALUES))('read a %s value in the browser', (_, value) => {
      document.cookie = `${name}=${value}; path=/`
      expect(definition().get()).toEqual(OBJECT)
    })

    it.each(Object.entries(VALUES))('read a %s value on the server from request cookies', (_, value) => {
      expect(readCookieState(definition(), nextCookieStore(`${name}=${value}`))).toEqual(OBJECT)
      expect(readCookieState(definition(), `${name}=${value}`)).toEqual(OBJECT)
    })
  })

  it('read raw strings as strings', () => {
    document.cookie = 'theme=dark; path=/'
    document.cookie = 'size=42; path=/'
    document.cookie = 'label=hello%20world; path=/'
    expect(persistentState('theme', { default: 'light', storage: 'cookie' }).get()).toBe('dark')
    expect(persistentState('size', { default: '', storage: 'cookie' }).get()).toBe('42')
    expect(persistentState('label', { default: '', storage: 'cookie' }).get()).toBe('hello world')
    expect(readCookieState(persistentState('theme', { default: 'light', storage: 'cookie' }), 'theme=dark')).toBe(
      'dark',
    )
  })

  it('prefer the canonical name over legacy names', () => {
    document.cookie = 'my:key=1; path=/'
    document.cookie = 'my%3Akey=2; path=/'
    expect(persistentState(KEY, { default: 0, storage: 'cookie' }).get()).toBe(2)
  })
})

describe('cookies written by 0.3.0', () => {
  it.each<unknown>([OBJECT, 'dark', '42', '', 3, true, null, ['a', 'b']])(
    'stay readable by 0.2.1 getPersistentCookieItem: %j',
    (value) => {
      persistentState<unknown, 'cookie'>(KEY, { default: 'unset', storage: 'cookie' }).set(value)
      const store = nextCookieStore(document.cookie)
      expect(getPersistentCookieItem021(store, KEY)).toEqual(value)
    },
  )

  it('read back on the server as they were written', () => {
    persistentState(KEY, { default: {}, storage: 'cookie' }).set(OBJECT)
    expect(readCookieState(definition(), nextCookieStore(document.cookie))).toEqual(OBJECT)
    expect(readCookieState(definition(), document.cookie)).toEqual(OBJECT)
  })
})

describe('readCookieState', () => {
  it('returns the default when no cookie is present', () => {
    expect(readCookieState(definition(), '')).toEqual({ a: 0, s: '' })
    expect(readCookieState(definition(), { get: () => undefined })).toEqual({ a: 0, s: '' })
  })

  it('reads the namespaced name', () => {
    const def = persistentState('k', { default: 0, namespace: 'app', storage: 'cookie' })
    expect(readCookieState(def, 'k=1; app%3Ak=2')).toBe(2)
  })

  it('accepts only cookie definitions', () => {
    const local = persistentState('k', { default: 0 })
    // @ts-expect-error a localStorage definition is not readable on the server
    expect(readCookieState(local, 'k=1')).toBe(0)
  })

  it('rejects objects that are not definitions', () => {
    const fake = { ...definition() }
    expect(() => readCookieState(fake, '')).toThrow(TypeError)
  })
})

describe('a cookie value that is not valid percent-encoding', () => {
  const BAD = '%E0%A4%A'
  const definition = (onError = vi.fn()) => persistentState('k', { default: 'light', storage: 'cookie', onError })

  it('yields the default, keeps the cookie and reports parse-failed in the browser', () => {
    document.cookie = `k=${BAD}; path=/`
    const onError = vi.fn()
    expect(definition(onError).get()).toBe('light')
    expect(document.cookie).toBe(`k=${BAD}`)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'parse-failed', key: 'k' }))
  })

  it.each([
    ['a Cookie header', `k=${BAD}`],
    ['a cookie source', { get: () => ({ value: BAD }) }],
  ])('yields the default and reports parse-failed on the server from %s', (_, cookies) => {
    const onError = vi.fn()
    expect(readCookieState(definition(onError), cookies)).toBe('light')
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'parse-failed', key: 'k' }))
  })

  it('still reads a string that holds a lone percent sign', () => {
    document.cookie = 'k=Save%2020%25; path=/'
    window.localStorage.setItem('w', BAD)
    const onError = vi.fn()
    expect(definition(onError).get()).toBe('Save 20%')
    expect(persistentState('w', { default: 'light', onError }).get()).toBe(BAD)
    expect(onError).not.toHaveBeenCalled()
  })
})

describe('deprecated 0.2.1 helpers', () => {
  const store = (map: Record<string, string>) => ({
    get: (name: string) => (name in map ? { value: map[name] } : undefined),
  })

  it('getPersistentCookieValue finds the double-encoded name', () => {
    expect(getPersistentCookieValue(store({ [NAMES['double-encoded']]: 'hello' }), KEY)).toBe('hello')
    expect(getPersistentCookieValue(store({}), KEY)).toBeUndefined()
  })

  it('getPersistentCookieItem parses plain, URI-encoded and double URI-encoded JSON', () => {
    for (const value of [JSON_TEXT, VALUES['URI-encoded'], VALUES['double URI-encoded']]) {
      expect(getPersistentCookieItem(store({ key: value }), 'key')).toEqual(OBJECT)
    }
    expect(getPersistentCookieItem(store({ key: 'not-json' }), 'key')).toBeUndefined()
  })

  it('getPersistentCookieItem returns undefined for a value that does not decode and still reads a lone percent sign', () => {
    expect(getPersistentCookieItem(store({ key: '%E0%A4%A' }), 'key')).toBeUndefined()
    expect(getPersistentCookieItem(store({ key: '"100%"' }), 'key')).toBe('100%')
  })
})
