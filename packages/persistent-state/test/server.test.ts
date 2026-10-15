// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { persistentState, readCookieState } from '@nicolopadovan/persistent-state'

describe('on the server', () => {
  const def = persistentState('theme', { default: 'light', storage: 'cookie' })

  it('get returns the default and isPersistent is false', () => {
    expect(def.get()).toBe('light')
    expect(def.isPersistent()).toBe(false)
  })

  it('subscribe returns a no-op unsubscribe and never calls the listener', () => {
    const listener = vi.fn()
    const unsubscribe = def.subscribe(listener)
    expect(unsubscribe).toBeTypeOf('function')
    unsubscribe()
    expect(listener).not.toHaveBeenCalled()
  })

  it('set and reset throw an error naming readState and Server Actions', () => {
    expect(() => def.set('dark')).toThrow(/readState\(\).*Server Actions/)
    expect(() => def.reset()).toThrow(/readState\(\).*Server Actions/)
  })

  it('readCookieState reads a Cookie header and a cookie source', () => {
    expect(readCookieState(def, 'a=1; theme=%22dark%22')).toBe('dark')
    expect(readCookieState(def, { get: (name) => (name === 'theme' ? { value: '"dark"' } : undefined) })).toBe('dark')
  })
})

describe('versioned and validated cookies on the server', () => {
  const onError = vi.fn()
  const def = persistentState('settings', {
    default: { mode: 'light' },
    storage: 'cookie',
    version: 2,
    migrate: (stored, from) => ({ mode: from === 0 ? String(stored) : (stored as { theme: string }).theme }),
    schema: {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: (value) =>
          typeof (value as { mode?: unknown } | undefined)?.mode === 'string' &&
          (value as { mode: string }).mode !== 'invalid'
            ? { value: value as { mode: string } }
            : { issues: [{ message: 'bad mode' }] },
      },
    },
    onError,
  })
  const header = (text: string): string => `settings=${encodeURIComponent(text)}`

  it('migrates a plain value and an older envelope', () => {
    expect(readCookieState(def, header('"dark"'))).toEqual({ mode: 'dark' })
    expect(readCookieState(def, header('{"__ps":1,"v":{"theme":"dim"},"ver":1}'))).toEqual({ mode: 'dim' })
  })

  it('reads a current envelope', () => {
    expect(readCookieState(def, header('{"__ps":1,"v":{"mode":"dark"},"ver":2}'))).toEqual({ mode: 'dark' })
  })

  it('yields the default and reports invalid, version-ahead and parse-failed', () => {
    onError.mockClear()
    expect(readCookieState(def, header('{"__ps":1,"v":{"mode":"invalid"},"ver":2}'))).toEqual({ mode: 'light' })
    expect(readCookieState(def, header('{"__ps":1,"v":{"mode":"dark"},"ver":3}'))).toEqual({ mode: 'light' })
    expect(readCookieState(def, header('{"__ps":1,"ver":2}'))).toEqual({ mode: 'light' })
    expect(onError.mock.calls.map(([error]) => (error as { code: string }).code)).toEqual([
      'invalid',
      'version-ahead',
      'parse-failed',
    ])
  })

  it('yields the default and reports invalid when validate returns nothing', () => {
    const onError = vi.fn()
    const broken = persistentState('k', {
      default: 1,
      storage: 'cookie',
      schema: { '~standard': { version: 1, vendor: 'test', validate: () => undefined as never } },
      onError,
    })
    expect(readCookieState(broken, 'k=4')).toBe(1)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'invalid' }))
  })
})
