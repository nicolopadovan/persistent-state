---
title: API reference
description: Every export of persistent-state, grouped by entry point, with its signature, options, return value and errors.
---

This page lists every export persistent-state ships, grouped by entry point. Each entry gives the signature, the options
with their types and defaults, the return value and the errors it throws. Options are optional unless marked
**Required**. The guides explain when to use each part, and [How it works](/internals/shared-record/) explains what the
code does underneath.

| Entry point                                                                    | Runs in                     | Exports                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------ | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@nicolopadovan/persistent-state`](#nicolopadovanpersistent-state)            | browser, Node, edge         | `persistentState`, `refreshConsent`, `readCookieState`, `PersistentStateError`, the types `PersistentState`, `PersistentStateOptions`, `StorageKind`, `CookieOptions`, `CookieSource`, `Serializer`, `StandardSchemaV1`, and the deprecated exports |
| [`@nicolopadovan/persistent-state/react`](#nicolopadovanpersistent-statereact) | browser and React SSR       | `useStoredState`, `usePersistentState`, `CookieValuesProvider`, the types `StoredStateMeta`, `UsePersistentStateOptions`, `CookieValuesProviderProps`                                                                                               |
| [`@nicolopadovan/persistent-state/next`](#nicolopadovanpersistent-statenext)   | Next.js server (App Router) | `PersistentStateProvider`, `readState`, the type `PersistentStateProviderProps`                                                                                                                                                                     |

The core imports nothing from React. The `/react` entry point starts with a `'use client'` directive. The `/next` entry
point imports `next/headers` and must only be imported by Server Components, Server Actions and Route Handlers.

:::caution[0.x releases may break]
Every 0.x minor release may contain breaking changes; patch releases never do. The exports marked **Deprecated** are
removed in 1.0.0.
:::

## `@nicolopadovan/persistent-state`

### `persistentState(key, options)`

Declares one persisted key: its type, where it is stored and how it is stored, in one place. Call it once at module
scope, in a module that both server and client code can import (a module without `'use client'`), and export the result.
Declaring a key reads and writes nothing; storage is first used by `get()`, `set()`, `reset()`, `subscribe()` or
`isPersistent()` in the browser.

```ts
import { persistentState } from '@nicolopadovan/persistent-state'

function persistentState<T, S extends StorageKind = 'localStorage'>(
  key: string,
  options: PersistentStateOptions<NoInfer<T>, S> & { schema: StandardSchemaV1<unknown, T> },
): PersistentState<T, S>
function persistentState<T, S extends StorageKind = 'localStorage'>(
  key: string,
  options: PersistentStateOptions<T, S> & { schema?: undefined },
): PersistentState<T, S>
```

`T` is the output type of `schema` when a schema is given, and the type of `default` otherwise. `S` is the type of
`storage`.

```ts
export const theme = persistentState('theme', { default: 'system', storage: 'cookie' })
```

| Option       | Type                                          | Default                                              | Description                                                                                                                                                          |
| ------------ | --------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `default`    | `T`                                           | **Required**                                         | The value used when nothing valid is stored. It is treated as immutable and is never validated by `schema`.                                                          |
| `storage`    | `StorageKind`                                 | `'localStorage'`                                     | Where the value is stored. Only `'cookie'` is readable on the server.                                                                                                |
| `schema`     | `StandardSchemaV1<unknown, T>`                | none                                                 | Validates every value read from storage. Synchronous schemas only. The schema must accept its own output. See [Schema](#schema).                                     |
| `version`    | `number` (an integer, `1` or more)            | none                                                 | The current shape version. A stored value with a lower version goes through `migrate`; one with a higher version is reported as `version-ahead`. Requires `migrate`. |
| `migrate`    | `(stored: unknown, fromVersion: number) => T` | none                                                 | Converts a value stored under an older version to the current one. `fromVersion` is `0` for a value stored without a version. Requires `version`.                    |
| `expires`    | `number` (days) or `Date`                     | cookie: `365`; Web Storage: none                     | When the value expires. See [Expiry](#expiry).                                                                                                                       |
| `namespace`  | `string`                                      | none                                                 | A prefix. The stored name becomes `` `${namespace}:${key}` ``, and `definition.key` returns it.                                                                      |
| `debounceMs` | `number`                                      | `0`                                                  | Delays storage writes by this many milliseconds. Memory and subscribers update at once. Pending writes are flushed when the page is hidden.                          |
| `sync`       | `boolean`                                     | `true`                                               | Follows changes made in other tabs. `sessionStorage` is never synced.                                                                                                |
| `serializer` | `Serializer<T>`                               | JSON                                                 | Converts values to and from the stored text.                                                                                                                         |
| `consent`    | `() => boolean`                               | none (always allowed)                                | While it returns `false`, storage is neither read nor written. See [Consent](#consent).                                                                              |
| `onError`    | `(error: PersistentStateError) => void`       | `console.warn('[persistent-state]', message, error)` | Receives every read, write, validation and migration failure. Pass `() => {}` to silence it. Exceptions it throws are not caught.                                    |
| `path`       | `string`                                      | `'/'`                                                | Cookie only. The cookie's `Path`.                                                                                                                                    |
| `domain`     | `string`                                      | none                                                 | Cookie only. The cookie's `Domain`. Without it, the cookie is limited to the current host.                                                                           |
| `secure`     | `boolean`                                     | `true` on `https:` pages, otherwise `false`          | Cookie only. Whether the cookie is sent only over HTTPS.                                                                                                             |
| `sameSite`   | `'strict' \| 'lax' \| 'none'`                 | `'lax'`                                              | Cookie only. The cookie's `SameSite` attribute.                                                                                                                      |

The cookie-only options are typed `never` when `storage` is not `'cookie'`, so `persistentState('k', { default: 0, path: '/' })`
is a type error.

**Returns** a [`PersistentState`](#the-definition-object) definition.

**Throws** a `TypeError` when:

- `key` is empty.
- `expires` is a negative or non-finite number, or an invalid `Date`.
- `version` is not an integer of `1` or more.
- `version` is set without `migrate`, or `migrate` without `version`.

No other call throws because of storage. Every storage failure goes to `onError`. An `onError` that throws is caught and
logged with `console.error`, so its error never reaches the caller.

#### Schema

`schema` accepts any [Standard Schema](https://standardschema.dev) (zod 4, valibot, arktype and others) whose
`validate` returns synchronously. The value type is the schema's output type, so a `default` or a `migrate` result that
does not match it is a type error.

```ts
import { z } from 'zod'

const Theme = z.enum(['light', 'dark', 'system'])
export const theme = persistentState('theme', { default: 'system', storage: 'cookie', schema: Theme })
// theme.get(): 'light' | 'dark' | 'system'
```

A stored value the schema rejects is reported as `invalid` with the schema's `issues`, and the default is used. A
schema that returns a promise is reported as `async-schema`.

<details>
<summary>A schema must accept its own output</summary>

`set()` stores the value you pass as it is; it does not run it through the schema. The next read validates the stored
value, and the schema's output replaces it. A schema that changes the shape of a value, such as a `transform` that turns
a string into a number, therefore sees its own output on the next read and rejects it. Every value that `set()` stores
and every value that `migrate` returns must pass `schema` unchanged. When it does not, the read reports `invalid` and
yields the default.

```ts
// Rejects its own output: the stored number is not a string
const bad = z.string().transform(Number)

// Accepts its own output: the stored object is an object
const good = z.object({ mode: Theme, size: z.number().default(1) })
```

`default` is never validated, so it does not have to pass the schema, but it is the value every failed read yields.

</details>

#### Expiry

`expires` is a number of days, counted from each write, or a fixed `Date`.

| Storage                          | Behavior                                                                                                                                                                                  |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cookie`                         | The cookie's `Expires` attribute. A number defaults to `365` days. `0` writes a session cookie, which the browser removes when it closes.                                                 |
| `localStorage`, `sessionStorage` | The value is stored in an envelope that holds its expiry and is removed on the first read after it. `0`, or no value, means it never expires and the value is stored without an envelope. |

A number is recomputed on every write, so each `set()` extends the expiry. A `Date` is fixed. `expires: 0` therefore
means no expiry for Web Storage but a session cookie for cookies.

#### Consent

`consent` is a plain predicate, so persistent-state does not depend on any consent manager. While it returns `false`:

- storage is neither read nor written;
- the value lives in memory, starting at `default`;
- `isPersistent()` is `false`.

The predicate is evaluated on first use, before every write and by [`refreshConsent()`](#refreshconsent). `reset()`
removes the stored item even while the predicate returns `false`. No stored item is deleted automatically when it
returns `false`, because a consent manager that has not loaded yet may return `false` for a moment. A predicate that
throws counts as `false`, and the error is logged with `console.error`.

<details>
<summary>Overloads, and forwarding options through a wrapper</summary>

The two overloads keep a `default`, or a `migrate` result, that does not match the schema's output a type error. A
single signature over `PersistentStateOptions<T, S>` would widen `T` and hide the mismatch.

The cost is that options typed `PersistentStateOptions<T, S>` match neither overload, because the general type may or may
not carry a schema. A wrapper that forwards its options casts them to the second overload's parameter type:

```ts
import {
  persistentState,
  type PersistentStateOptions,
  type StorageKind,
} from '@nicolopadovan/persistent-state'

export const appState = <T, S extends StorageKind>(key: string, options: PersistentStateOptions<T, S>) =>
  persistentState(key, { namespace: 'app', ...options } as PersistentStateOptions<T, S> & { schema?: undefined })
```

The cast only silences the type check. The schema is still read from the options and honored at runtime; what is lost is
the check that `default` matches the schema's output.

</details>

### The definition object

`persistentState()` returns a `PersistentState`.

```ts
interface PersistentState<T, S extends StorageKind = StorageKind> {
  readonly key: string
  readonly storage: S
  readonly defaultValue: T
  get(): T
  set(next: T | ((prev: T) => T)): void
  reset(): void
  subscribe(listener: () => void): () => void
  isPersistent(): boolean
}
```

| Member                | Description                                                                                                                                                                                                                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `key`                 | The full stored name, namespace included.                                                                                                                                                                                                                                                                   |
| `storage`             | Where the value is stored.                                                                                                                                                                                                                                                                                  |
| `defaultValue`        | The `default` option.                                                                                                                                                                                                                                                                                       |
| `get()`               | Returns the current value. The first call in a page reads storage through the [read pipeline](/internals/read-pipeline/); later calls return the cached value, so an object keeps its identity. On the server it returns the default.                                                                       |
| `set(next)`           | Updates the value in memory, notifies subscribers synchronously, then writes it through the [write pipeline](/internals/write-pipeline/). A function receives the current value. A value `Object.is`-equal to the current one does nothing, and `undefined` is the same as `reset()`. Throws on the server. |
| `reset()`             | Sets the value to the default, notifies subscribers and removes the stored item; a cookie is removed under every name an older version may have written it. It cancels a pending debounced write and removes the item even while `consent` returns `false`. Throws on the server.                           |
| `subscribe(listener)` | Calls `listener` when the value or `isPersistent()` changes. Returns the unsubscribe function. On the server it does nothing and returns a no-op.                                                                                                                                                           |
| `isPersistent()`      | Whether the value is being stored. `false` while it lives only in memory (storage is unavailable, a write failed, or `consent` returns `false`) and on the server.                                                                                                                                          |

Every definition with the same `storage` and full key shares one in-memory record, so they hold one value and notify
together. See [The shared record](/internals/shared-record/).

**Throws** an `Error` from `set()` and `reset()` on the server, that is, when there is no `document`. The message names
`readState()`: server writes are not supported yet.

<details>
<summary>After a read that reports version-ahead</summary>

A stored value written under a higher `version`, or in a newer envelope format, is reported as `version-ahead`, and
`get()` returns the default. The stored item is left untouched for the newer code that wrote it. Because `get()` returns
the default, `set(prev => …)` starts from the default, not from the stored value, and its result replaces the item
written by newer code. `reset()` removes it.

```ts
// storage holds {"__ps":1,"v":{"mode":"dark"},"ver":3}, and this code is at version 2
settings.get() // the default, and 'version-ahead' goes to onError
settings.set((prev) => ({ ...prev, size: 2 })) // prev is the default; the item is replaced at version 2
```

</details>

### `refreshConsent()`

Re-evaluates the `consent` predicate of every definition used in the page. Call it when the consent state changes.

```ts
import { refreshConsent } from '@nicolopadovan/persistent-state'

function refreshConsent(): void
```

For each definition whose predicate result changed:

- **To `true`**: a value set in memory since consent was withheld is written to storage. Otherwise the stored value is
  read and subscribers are notified when the value changed.
- **To `false`**: the value stays in memory and `isPersistent()` becomes `false`. Nothing is deleted from storage; call
  `reset()` on a definition to remove its item.

A definition that was never used in the page is not evaluated, because it evaluates the predicate on first use. On the
server, `refreshConsent()` does nothing.

```ts
consentManager.subscribe((state) => {
  if (!state.preferences) theme.reset()
  refreshConsent()
})
```

**Returns** nothing. **Throws** nothing.

### `readCookieState(definition, cookies)`

The framework-free server read for cookie definitions, for any runtime. In Next.js, use [`readState`](#readstatedefinition)
instead.

```ts
import { readCookieState } from '@nicolopadovan/persistent-state'

function readCookieState<T>(definition: PersistentState<T, 'cookie'>, cookies: CookieSource | string): T

interface CookieSource {
  get(name: string): { value: string } | undefined
}
```

| Parameter    | Type                                        | Description                                                                                                                                                                           |
| ------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `definition` | `PersistentState<T, 'cookie'>`              | **Required.** A definition created by `persistentState()` with `storage: 'cookie'`. A definition for another storage is a type error.                                                 |
| `cookies`    | [`CookieSource`](#cookiesource) \| `string` | **Required.** The request's cookies: an object with `get(name)` whose value is URI-decoded once, such as Next.js's `cookies()`, or a `Cookie` header string, which is parsed for you. |

**Returns** the stored value, decoded, migrated and validated like a browser read, or the definition's default when no
cookie holds a valid value. It does not write back a migrated value and does not evaluate the `consent` predicate:
cookies exist only if they were written with consent. Failures go to the definition's `onError`.

**Throws** a `TypeError` when `definition` was not created by `persistentState()`.

### `PersistentStateError`

The error passed to `onError`. No public function throws it.

```ts
import { PersistentStateError } from '@nicolopadovan/persistent-state'

class PersistentStateError extends Error {
  constructor(
    code: PersistentStateError['code'],
    key: string,
    details?: { cause?: unknown; issues?: readonly StandardSchemaV1.Issue[] },
  )
  readonly code:
    | 'unavailable'
    | 'write-failed'
    | 'parse-failed'
    | 'invalid'
    | 'async-schema'
    | 'migrate-failed'
    | 'version-ahead'
  readonly key: string
  readonly issues?: readonly StandardSchemaV1.Issue[]
  // `cause` holds the underlying error
}
```

| Property  | Description                                                                           |
| --------- | ------------------------------------------------------------------------------------- |
| `code`    | What failed. See the codes below.                                                     |
| `key`     | The full stored name of the definition, namespace included.                           |
| `issues`  | The issues the schema reported. Set for `invalid` when the schema rejected the value. |
| `cause`   | The underlying error, when there is one.                                              |
| `name`    | `'PersistentStateError'`.                                                             |
| `message` | `"<key>": ` followed by a sentence describing the code.                               |

The seven codes:

| Code             | Reported when                                                                                                                                                                                                                                                                                                        | The value is                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `unavailable`    | The storage cannot be used: the probe write to Web Storage threw something other than a quota error, `navigator.cookieEnabled` is `false`, or reading threw (then `cause` is set). Reported once per key; probed once per page.                                                                                      | Kept in memory for the page; `isPersistent()` is `false`.                 |
| `write-failed`   | `setItem` threw, for example a quota error. Or a cookie did not read back from `document.cookie` (blocked, or over the browser's size limit). Or the value could not be serialized. Also reported when writing back a migrated value.                                                                                | Kept in memory; `isPersistent()` is `false` until a later write succeeds. |
| `parse-failed`   | `serializer.deserialize` threw, or the stored envelope is malformed: it has no `v`, a `ver` that is not a non-negative integer, an `exp` that is not a finite number, or, with a custom serializer, a `v` that is not a string. Also a cookie value with a percent-escape that is not valid UTF-8, such as `%E0%A4`. | The default.                                                              |
| `invalid`        | The schema reported issues (see `issues`), returned nothing, or threw (then `cause` is set).                                                                                                                                                                                                                         | The default.                                                              |
| `async-schema`   | The schema's `validate` returned a promise. Only synchronous schemas are supported.                                                                                                                                                                                                                                  | The default.                                                              |
| `migrate-failed` | `migrate` threw or returned `undefined`.                                                                                                                                                                                                                                                                             | The default.                                                              |
| `version-ahead`  | The stored item was written under a `version` higher than the current one, or in a newer envelope format: an object whose `__ps` is anything other than `1` reads as version-ahead, whether or not the definition sets `version`.                                                                                    | The default.                                                              |

A read never writes to or removes the stored item, with two exceptions: an expired Web Storage item is removed, and a
migrated value is written back once. A read that yields the default because of `parse-failed`, `invalid`,
`async-schema`, `migrate-failed` or `version-ahead` therefore leaves the item in place. `set()` replaces it and
`reset()` removes it.

<details>
<summary>Reading the error in <code>onError</code></summary>

`PersistentStateError['code']` is the union of the seven codes; the union has no exported name of its own.

```ts
persistentState('settings', {
  default: { mode: 'light' },
  schema: Settings,
  onError(error) {
    if (error.code === 'invalid') report(error.key, error.issues)
    else if (error.code !== 'version-ahead') report(error.key, error.cause)
  },
})
```

</details>

### Types

#### `StorageKind`

```ts
type StorageKind = 'cookie' | 'localStorage' | 'sessionStorage'
```

Where a value is stored. Only `'cookie'` is readable on the server.

#### `PersistentStateOptions<T, S>`

```ts
type PersistentStateOptions<T, S extends StorageKind = 'localStorage'> = CommonOptions<T, S> &
  (S extends 'cookie' ? CookieOptions : { [K in keyof CookieOptions]?: never })
```

The options of [`persistentState()`](#persistentstatekey-options). `CommonOptions` is the table of options above without
the four cookie attributes.

#### `CookieOptions`

```ts
interface CookieOptions {
  path?: string
  domain?: string
  secure?: boolean
  sameSite?: 'strict' | 'lax' | 'none'
}
```

The attributes of the cookie a `'cookie'` definition writes. Each one is applied on every write and on removal.

#### `CookieSource`

```ts
interface CookieSource {
  get(name: string): { value: string } | undefined
}
```

Read access to request cookies, shaped like the cookie store of Next.js's `cookies()`. `get` returns the cookie with
exactly this name, its value URI-decoded once, or `undefined`.

#### `Serializer<T>`

```ts
interface Serializer<T> {
  serialize(value: T): string
  deserialize(text: string): unknown
}
```

Converts values to and from the stored text. A `deserialize` that throws is reported as `parse-failed` and the default is
used. The result of `deserialize` still goes through `migrate` and `schema`.

```ts
export const day = persistentState('day', {
  default: new Date(0),
  serializer: {
    serialize: (value) => value.toISOString(),
    deserialize: (text) => new Date(text),
  },
})
```

#### `StandardSchemaV1<Input, Output>`

The Standard Schema interface (version 1), vendored from `@standard-schema/spec` 1.1.0 so the package has no
dependency. zod 4, valibot and arktype schemas satisfy it. persistent-state calls `schema['~standard'].validate(value)`.

### Deprecated exports

The exports below keep the behavior they had in 0.2.1 and are removed in 1.0.0.

#### `getPersistentCookieItem(cookieStore, key)`

**Deprecated.** Use [`readCookieState`](#readcookiestatedefinition-cookies) with a definition from `persistentState()`.

```ts
function getPersistentCookieItem<T>(cookieStore: PersistentCookieStore, key: string): T | undefined
```

Returns the JSON value of the cookie stored for `key`, trying the value as it is, then URI-decoded once and twice.
**Returns** `undefined` when no cookie is found, the value is empty, or none of the forms is JSON. It does not use
`default`, `schema` or `migrate`, and it does not unwrap envelopes.

**Throws** a `URIError` when the cookie value contains a malformed percent escape.

#### `getPersistentCookieValue(cookieStore, key)`

**Deprecated.** Use [`readCookieState`](#readcookiestatedefinition-cookies).

```ts
function getPersistentCookieValue(cookieStore: PersistentCookieStore, key: string): string | undefined
```

Returns the raw value of the cookie stored for `key`, looking under its raw name, its `encodeURIComponent` name and its
double-encoded name, in that order.

#### `PersistentCookieStore`

**Deprecated.** An alias of [`CookieSource`](#cookiesource).

#### `StorageType`

**Deprecated.** An alias of [`StorageKind`](#storagekind).

## `@nicolopadovan/persistent-state/react`

### `useStoredState(definition)`

Uses a definition in a component. Every component that uses a definition with the same storage and key shares one value
and re-renders together.

```tsx
'use client'

import { useStoredState } from '@nicolopadovan/persistent-state/react'

function useStoredState<T, S extends StorageKind>(
  definition: PersistentState<T, S>,
): [value: T, setValue: (next: T | ((prev: T) => T)) => void, meta: StoredStateMeta]

const [theme, setTheme, { reset, isPersistent }] = useStoredState(themeState)
```

| Parameter    | Type                    | Description                                                |
| ------------ | ----------------------- | ---------------------------------------------------------- |
| `definition` | `PersistentState<T, S>` | **Required.** A definition created by `persistentState()`. |

**Returns** a tuple:

| Element    | Type                                    | Description                                                   |
| ---------- | --------------------------------------- | ------------------------------------------------------------- |
| `value`    | `T`                                     | The current value.                                            |
| `setValue` | `(next: T \| ((prev: T) => T)) => void` | The definition's `set`. It keeps its identity across renders. |
| `meta`     | [`StoredStateMeta`](#storedstatemeta)   | `reset` and `isPersistent`.                                   |

During server rendering and hydration, a Web Storage definition renders its default, and a cookie definition renders the
value from the nearest [`CookieValuesProvider`](#cookievaluesprovider) or, without one, its default. The stored
value follows right after hydration, so hydration never mismatches. See [Hydration snapshots](/internals/hydration/).

**Throws** nothing. `setValue` and `reset` throw only if called on the server.

### `usePersistentState(key, initial, options?)`

Persists state for a one-off key without declaring it with `persistentState()`. Prefer a definition for a key that is
used in more than one place or read on the server.

```tsx
'use client'

import { usePersistentState } from '@nicolopadovan/persistent-state/react'

function usePersistentState<T, S extends StorageKind = 'localStorage'>(
  key: string,
  initial: T | (() => T),
  options?: UsePersistentStateOptions<T, S>,
): [value: T, setValue: (next: T | ((prev: T) => T)) => void, meta: StoredStateMeta]

const [open, setOpen] = usePersistentState('sidebar-open', true)
```

| Parameter | Type                                                            | Default | Description                                                                                |
| --------- | --------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------ |
| `key`     | `string`                                                        |         | **Required.** The stored name, prefixed by `namespace` when one is given.                  |
| `initial` | `T \| (() => T)`                                                |         | **Required.** The default value, or a function that returns it. A function is called once. |
| `options` | [`UsePersistentStateOptions<T, S>`](#usepersistentstateoptions) | none    | Every `persistentState()` option except `default`, plus the deprecated aliases.            |

**Returns** the same tuple as [`useStoredState`](#usestoredstatedefinition).

The hook builds a definition the first time it renders and again whenever the full key or the storage changes. Other
options are read when the definition is built, so a change to them in a later render has no effect.

#### `UsePersistentStateOptions`

```ts
type UsePersistentStateOptions<T, S extends StorageKind = 'localStorage'> = Omit<
  PersistentStateOptions<T, S>,
  'default'
> & {
  storageType?: S
  syncAcrossTabs?: boolean
}
```

| Option           | Type      | Description                                                                                                                                             |
| ---------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storageType`    | `S`       | **Deprecated.** The 0.2.1 name of `storage`. `storage` wins when both are set. Removed in 1.0.0.                                                        |
| `syncAcrossTabs` | `boolean` | **Deprecated.** The 0.2.1 name of `sync`. `sync` wins when both are set. Removed in 1.0.0. The default of `sync` is `true`; 0.2.1 defaulted to `false`. |

### `CookieValuesProvider`

Supplies the request's cookie values for server rendering and hydration, so cookie definitions render their stored value
on the server and hydrate without a mismatch. Render it with the same `cookies` on the server and on the client. In
Next.js, render [`PersistentStateProvider`](#persistentstateprovider) instead, which renders this component.

```tsx
import { CookieValuesProvider } from '@nicolopadovan/persistent-state/react'

function CookieValuesProvider(props: CookieValuesProviderProps): ReactElement

<CookieValuesProvider cookies={request.headers.get('cookie') ?? ''}>
  <App />
</CookieValuesProvider>
```

#### `CookieValuesProviderProps`

| Prop       | Type                               | Default | Description                                                                                                                                                                                                                                                                             |
| ---------- | ---------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cookies`  | `Record<string, string> \| string` |         | **Required.** The request's cookies: a record of cookie names to values URI-decoded once, as Next.js's `cookies()` returns them, or a raw `Cookie` header.                                                                                                                              |
| `listed`   | `readonly string[]`                | none    | The stored names (`definition.key`) of the cookie definitions the provider covers. When given, only a definition missing from it logs the development warning below, so a covered definition whose cookie the visitor does not have yet stays quiet. `PersistentStateProvider` sets it. |
| `children` | `ReactNode`                        | none    | The tree that renders cookie definitions.                                                                                                                                                                                                                                               |

In development, when a cookie definition is rendered on the server under a provider that holds no cookie for it, a
single warning per key is logged, and the definition renders its default. Without `listed`, "holds no cookie" means that
no cookie name of the key is present in `cookies`.

### `StoredStateMeta`

The third element of the tuple returned by `useStoredState` and `usePersistentState`.

```ts
interface StoredStateMeta {
  reset: () => void
  isPersistent: boolean
}
```

| Property       | Type         | Description                                                                                           |
| -------------- | ------------ | ----------------------------------------------------------------------------------------------------- |
| `reset`        | `() => void` | Sets the value back to the default and removes the stored item. It keeps its identity across renders. |
| `isPersistent` | `boolean`    | Whether the value is being stored. `true` during server rendering and hydration, then the real state. |

## `@nicolopadovan/persistent-state/next`

### `PersistentStateProvider`

A Server Component that makes the stored values of cookie definitions available to server rendering and hydration, so
they render without a flash of their default. It reads only the cookies of the listed definitions, under every name an
older version may have written them, and renders `CookieValuesProvider` with them. Other cookies never reach the client.

```tsx
import { PersistentStateProvider } from '@nicolopadovan/persistent-state/next'

async function PersistentStateProvider(props: PersistentStateProviderProps): Promise<ReactElement>

<PersistentStateProvider states={[themeState]}>{children}</PersistentStateProvider>
```

Like every `cookies()` call from `next/headers`, it makes the route dynamic, so render it in the layout that needs it,
not at the root of an app where every route would become dynamic.

#### `PersistentStateProviderProps`

```ts
interface PersistentStateProviderProps {
  states: readonly Pick<PersistentState<unknown, 'cookie'>, 'key' | 'storage'>[]
  children?: ReactNode
}
```

| Prop       | Type                                      | Default | Description                                                                                                                        |
| ---------- | ----------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `states`   | `readonly PersistentState<…, 'cookie'>[]` |         | **Required.** The cookie definitions whose stored values the first render needs. A definition for another storage is a type error. |
| `children` | `ReactNode`                               | none    | The tree that renders those definitions.                                                                                           |

### `readState(definition)`

Reads a cookie definition in a Server Component, Server Action or Route Handler. It is
`readCookieState(definition, await cookies())`.

```tsx
import { readState } from '@nicolopadovan/persistent-state/next'

async function readState<T>(definition: PersistentState<T, 'cookie'>): Promise<T>

const theme = await readState(themeState)
```

| Parameter    | Type                           | Description                                                                         |
| ------------ | ------------------------------ | ----------------------------------------------------------------------------------- |
| `definition` | `PersistentState<T, 'cookie'>` | **Required.** A definition created by `persistentState()` with `storage: 'cookie'`. |

**Returns** a promise of the stored value, decoded, migrated and validated as in the browser, or the definition's
default when the visitor has no cookie for it. It makes the route dynamic.

**Throws** a `TypeError` when `definition` was not created by `persistentState()`. Passing a definition for another
storage is a type error.
