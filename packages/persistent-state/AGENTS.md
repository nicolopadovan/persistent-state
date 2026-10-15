# AGENTS.md

Instructions for AI coding agents that use `@nicolopadovan/persistent-state` in an application. If you are changing
the package's own source, read the `AGENTS.md` at the root of its repository instead.

The documentation as one Markdown file: https://persistent-state.nicolopadovan.com/llms-full.txt

Every 0.x minor may contain breaking changes. Pin the version and read the changelog before you upgrade.

## Entry points

| Import                                  | Runs in                     | Exports                                                                        |
| --------------------------------------- | --------------------------- | ------------------------------------------------------------------------------ |
| `@nicolopadovan/persistent-state`       | browser, Node, edge         | `persistentState`, `refreshConsent`, `readCookieState`, `PersistentStateError` |
| `@nicolopadovan/persistent-state/react` | browser and React SSR       | `useStoredState`, `usePersistentState`, `CookieValuesProvider`                 |
| `@nicolopadovan/persistent-state/next`  | Next.js server (App Router) | `PersistentStateProvider`, `readState`                                         |

`/next` imports `next/headers`: import it only in Server Components, Server Actions and Route Handlers. The package has
no runtime dependencies; `react` and `next` are optional peer dependencies.

## Declare each key once

```ts
// lib/state.ts: no 'use client', so server and client code can both import it
import { persistentState } from '@nicolopadovan/persistent-state'

export type Theme = 'light' | 'dark' | 'system'

export const theme = persistentState<Theme, 'cookie'>('theme', { default: 'system', storage: 'cookie' })
```

- Call `persistentState()` once per key, at module scope, and import the definition wherever the key is used. For a
  one-off key in a single component, use `usePersistentState(key, initial, options)` from `/react`.
- `T` is inferred from the `schema`'s output type, otherwise from `default`, where a literal widens (`'system'` is
  `string`). To narrow it, name both type arguments, as above: TypeScript does not infer `S` once you name `T`, and `S`
  defaults to `'localStorage'`.
- Treat `default` and every value as immutable. `set()` does nothing when the new value is `Object.is`-equal to the
  current one, so changing an object in place never updates anything. Setting `undefined` is the same as `reset()`.

## Choose the storage by what the server must read

- `'cookie'`: the only storage the server can read, so the only one that renders its stored value on the server without
  a flash. Use it for state the first paint depends on, such as a theme or a sidebar's open state. The browser sends it
  with every request.
- `'localStorage'` (the default): survives restarts, shared by all tabs, never readable on the server.
- `'sessionStorage'`: per tab, never synced across tabs, never readable on the server.

A `localStorage` or `sessionStorage` definition renders its `default` on the server and during hydration, then the
stored value.

## Use the key in React

```tsx
'use client'
import { useStoredState } from '@nicolopadovan/persistent-state/react'
import { theme } from '../lib/state'

export function ThemeToggle() {
  const [value, setValue, { reset, isPersistent }] = useStoredState(theme)
  return (
    <button onClick={() => setValue((prev) => (prev === 'dark' ? 'light' : 'dark'))}>
      {value}
      {isPersistent ? '' : ' (not saved)'}
    </button>
  )
}
```

- Never read storage while rendering: not `localStorage`, `document.cookie` or `theme.get()` in a component body. The
  server render and the first client render must agree, and `useStoredState` guarantees that. Call `get()`, `set()` and
  `reset()` from event handlers and effects.
- On the server, `get()` returns the default, and `set()` and `reset()` throw. Server writes are not supported in 0.3.0.
- Every definition and hook with the same storage and full key (`namespace:key` when `namespace` is set) shares one
  value in the page.

## Render cookie state on the server

In the Next.js App Router, list every cookie definition the first paint needs in `PersistentStateProvider`:

```tsx
// app/layout.tsx, a Server Component
import { PersistentStateProvider, readState } from '@nicolopadovan/persistent-state/next'
import { theme } from '../lib/state'

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const current = await readState(theme) // also usable in Server Actions and Route Handlers
  return (
    <html data-theme={current}>
      <body>
        <PersistentStateProvider states={[theme]}>{children}</PersistentStateProvider>
      </body>
    </html>
  )
}
```

- A cookie definition missing from `states` renders its `default` on the server and the stored value after hydration,
  and development logs a warning naming the key.
- Only the listed definitions' cookies reach the client. Both `PersistentStateProvider` and `readState` call
  `cookies()`, which makes the route dynamic; render them in the layout that needs them.
- Other React SSR frameworks: render `CookieValuesProvider` from `/react` with the request's cookies (a record or a
  `Cookie` header string), the same on the server and the client, and read with `readCookieState(definition, cookies)`.

## Validate and version any shape that may change

```ts
import { z } from 'zod'

const Layout = z.object({ compact: z.boolean(), columns: z.number() })

export const layout = persistentState('layout', {
  default: { compact: false, columns: 2 },
  schema: Layout,
  version: 2,
  migrate: (stored) => ({ columns: 2, ...(stored as { compact: boolean }) }),
})
```

- `schema` is any synchronous Standard Schema (zod, valibot, arktype). A stored value it rejects reports `invalid` and
  yields `default`; an asynchronous schema reports `async-schema`.
- A schema must accept its own output. `set()` stores a value of the schema's output type, and the next read validates
  the stored value as the schema's input. `z.string().transform(Number)` rejects the number it stored, so every read
  falls back to `default`. Keep the transform out of the schema.
- `version` (an integer of 1 or more) and `migrate` go together; either one alone throws a `TypeError`. Raise `version`
  whenever the stored shape changes. `migrate(stored, fromVersion)` receives the raw stored value, with `fromVersion` `0`
  for a value stored without a version. Its result goes through `schema` and is written back once. A throw or an
  `undefined` result reports `migrate-failed` and yields `default`.
- Data saved by newer code (a stored version above `version`) reports `version-ahead`. `get()` returns `default`, and
  nothing is deleted by reading. `set(prev => …)` then starts from `default`, `set(value)` replaces the newer item and
  `reset()` removes it.

## Expiry

- `expires` is a number of days counted from each write, or a `Date`. A cookie expires after `365` days by default. In
  `localStorage` and `sessionStorage` the value is stored with its expiry and removed on the first read after it.
- `expires: 0` means different things. A cookie becomes a session cookie, removed when the browser session ends.
  `localStorage` and `sessionStorage` get no expiry at all.
- A negative or non-finite number, or an invalid `Date`, throws a `TypeError`.

## Consent

```ts
import { persistentState, refreshConsent } from '@nicolopadovan/persistent-state'

export const prefs = persistentState('prefs', {
  default: { dense: false },
  consent: () => analytics.consent.getConsent()?.preferences === true, // ConsentLayer
})

analytics.consent.subscribe(({ consent }) => {
  if (!consent?.preferences) prefs.reset()
  refreshConsent()
})
```

- While `consent` returns `false`, storage is neither read nor written. The value lives in memory, starting at
  `default`, and `isPersistent` is `false`. Set `consent` on every definition that is not strictly necessary.
- The predicate is evaluated on first use, before every write and by `refreshConsent()`. Call `refreshConsent()`
  whenever consent changes. When it becomes `true`, a value set in memory is written; otherwise the stored value is
  read.
- Nothing is ever deleted automatically, because a consent manager that has not loaded yet may return `false` for a
  moment. To delete on withdrawal, call `reset()`; it removes the stored item even while `consent` returns `false`.
- `readState` and `readCookieState` do not evaluate `consent`.
- persistent-state has not been legally reviewed. Whether a setup complies with the law is the application owner's
  responsibility; see ConsentLayer's [legal notice](https://consentlayer.nicolopadovan.com/guides/legal/).

## Cookies

- If two cookies share a name, for example after a `path` or `domain` change, the client reads the first one and the
  Next.js server the last one, so the server render and the client can disagree. Keep one cookie per key.
- `path` defaults to `'/'` and `domain` to none. `reset()` removes the cookie with the definition's own `path` and
  `domain` (under every name an older version may have used). It cannot reach a legacy cookie set on a different path
  or domain, which stays readable.
- A cookie the browser rejects, for example one over its size limit, reports `write-failed`.

## Errors

No function throws because of storage. Every read, write, validation and migration failure goes to the `onError`
option as a `PersistentStateError` with a `code`, and by default to `console.warn`. The exceptions that throw are
`set()` and `reset()` on the server, and invalid options in `persistentState()`.

## Wrappers

`persistentState` has two overloads, so a wrapper that forwards a `PersistentStateOptions<T, S>` value must cast it:

```ts
import { persistentState, type PersistentStateOptions, type StorageKind } from '@nicolopadovan/persistent-state'

export function setting<T, S extends StorageKind = 'localStorage'>(key: string, options: PersistentStateOptions<T, S>) {
  return persistentState<T, S>(key, options as PersistentStateOptions<T, S> & { schema?: undefined })
}
```

The `schema` is still applied at runtime.

## Stored values are not private

The visitor, and any script on the page, can read and change every stored value. Never store secrets, tokens or
anything the server must trust, and validate cookie values you read on the server with a `schema`.

## Upgrading from 0.2.x

- `usePersistentState` moved to `/react`; `PersistentStateCookiesProvider` and its cookie library dependency are gone.
- `sync` now defaults to `true`, and a cookie without `expires` lasts `365` days instead of the session.
- Values stored by 0.2.x still read. A raw string reads as a string when `default` is a string. A `null` stored by 0.2.1
  now reads as `null`, unless `default` is a string; 0.2.1 treated it as missing and used the default.
