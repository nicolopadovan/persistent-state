# Spec: persistent-state 0.x, the first public release

Status: draft · 2026-10-15 · branch `feat/0x-setup` · plan: [plan.md](./plan.md)

## Summary

`@nicolopadovan/persistent-state` 0.2.1 is a React hook published privately on GitHub Packages. It persists state to a
cookie, `localStorage` or `sessionStorage`, and it depends on `next-client-cookies` and its `CookiesProvider` for every
use. This card turns it into a public npm package with the project setup of ConsentLayer
(`/Users/nico/Documents/analytics-consent-manager-npm`): a pnpm and Turborepo monorepo, a framework-free core with
`/react` and `/next` entry points, an Astro Starlight docs site at `persistent-state.nicolopadovan.com`, CI that runs
locally under `act`, and releases from Changesets with npm trusted publishing.

The first public version is **0.3.0**. It fixes three confirmed bugs in 0.2.1, adds a "declare each key once" API, and
ships the reliability features listed under [Goals](#goals).

## Decided by Nico

These are fixed inputs, not open for this card:

- Versioning is 0.x and explicitly unstable. The first public release is 0.3.0, continuing from 0.2.1. Every 0.x minor
  may break; the README and docs say so. 1.0.0 ships when the roadmap core is done.
- The name stays `@nicolopadovan/persistent-state`; the repository is `nicolopadovan/persistent-state`, made public by
  Nico at the first public release.
- Docs at `https://persistent-state.nicolopadovan.com` on GitHub Pages, built with Astro Starlight, with `llms.txt` and
  `llms-full.txt`. The docs exist mainly so agents use the package well: JSDoc on every export, an `AGENTS.md` shipped
  in the npm tarball, and `llms-full.txt`.
- The monorepo layout and tooling copy ConsentLayer (listed in [Package layout](#package-layout) and
  [Quality bars](#quality-bars-and-checks)).
- Zero runtime dependencies. `next-client-cookies` is dropped.
- The 0.3.0 scope and the roadmap features named in [Roadmap](#roadmap).
- No private project names in any public file. Migrating Nico's own apps to the npm package is a later, separate step.

## Goals

1. Fix the three confirmed bugs of 0.2.1:
   1. Strings such as `"42"` or `"true"` are stored raw and parsed back as a number or a boolean (`setItem` stores
      strings unencoded, `getItem` `JSON.parse`s every value, in `src/useStorage.ts`).
   2. `localStorage` and `sessionStorage` state causes a React hydration mismatch: `getServerSnapshot` in
      `src/client.ts` reads storage on the client during hydration, so the client's server snapshot differs from what
      the server rendered.
   3. Every use requires `next-client-cookies` and its `CookiesProvider`, even for `localStorage`.
2. Add the "declare each key once" API: `persistentState()` defines a key with its type, storage and options in one
   place; `useStoredState()` uses it on the client and `readState()` on the server.
3. Add `reset`, cross-tab sync on by default (cookies included), an in-memory fallback with an `isPersistent` flag,
   Standard Schema validation, `version` and `migrate`, expiry for Web Storage, and an optional consent predicate.
4. Keep what 0.2.1 does right: debounced writes flushed when the page is hidden, `namespace`, same-key sync across
   components, and tolerant reads of cookies written by older versions.
5. Ship it as a public, documented, size-budgeted package that an agent can use correctly from its JSDoc, `AGENTS.md`
   and `llms-full.txt` alone.

## Non-goals

- Vue, Svelte and Solid bindings, async storage (IndexedDB), devtools, URL state and server-synced storage: they are on
  the [Roadmap](#roadmap), not in 0.3.0.
- Writing state from the server (Server Actions, Route Handlers). Planned for 0.4.0.
- Encrypting or signing stored values. Stored values are readable and writable by the visitor and by any script on the
  page; the docs say so.
- Migrating Nico's own apps, deleting the GitHub Packages release, publishing, and changing repository settings: these
  are listed in the plan as Nico's steps or as later work.
- Rewriting git history (see [Decisions](#decisions)).

## Public API

### Entry points

| Entry point                             | Runs in                     | Exports                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@nicolopadovan/persistent-state`       | browser, Node, edge         | `persistentState`, `refreshConsent`, `readCookieState`, `PersistentStateError`; types `PersistentState`, `PersistentStateOptions`, `StorageKind`, `CookieOptions`, `CookieSource`, `Serializer`, `StandardSchemaV1`; deprecated `getPersistentCookieItem`, `getPersistentCookieValue`, `PersistentCookieStore`, `StorageType` |
| `@nicolopadovan/persistent-state/react` | browser and React SSR       | `useStoredState`, `usePersistentState`, `CookieValuesProvider`; types `StoredStateMeta`, `UsePersistentStateOptions`                                                                                                                                                                                                          |
| `@nicolopadovan/persistent-state/next`  | Next.js server (App Router) | `PersistentStateProvider`, `readState`                                                                                                                                                                                                                                                                                        |

The core imports nothing from React. `/react` starts with a `'use client'` directive. `/next` imports `next/headers` and
must only be imported by Server Components, Server Actions and Route Handlers.

### `persistentState(key, options)`

```ts
function persistentState<T, S extends StorageKind = 'localStorage'>(
  key: string,
  options: PersistentStateOptions<NoInfer<T>, S> & { schema: StandardSchemaV1<unknown, T> },
): PersistentState<T, S>
function persistentState<T, S extends StorageKind = 'localStorage'>(
  key: string,
  options: PersistentStateOptions<T, S> & { schema?: undefined },
): PersistentState<T, S>

type StorageKind = 'cookie' | 'localStorage' | 'sessionStorage'
```

Declares one persisted key. Call it once at module scope, in a module both server and client code can import (no
`'use client'`), and export the result. `T` is inferred from `schema`'s output type when a schema is given, otherwise
from `default`.

The two overloads keep a `default` or a `migrate` result that does not match the schema's output a type error. A single
signature over `PersistentStateOptions<T, S>` widens `T` and hides it, so a wrapper that forwards options typed
`PersistentStateOptions<T, S>` casts them to `PersistentStateOptions<T, S> & { schema?: undefined }`; the schema is
still honoured at runtime.

| Option       | Type                                          | Default          | Meaning                                                                                                                                                                 |
| ------------ | --------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `default`    | `T`                                           | **Required**     | The value used when nothing valid is stored. Treated as immutable.                                                                                                      |
| `storage`    | `StorageKind`                                 | `'localStorage'` | Where the value is stored. Only `'cookie'` is readable on the server.                                                                                                   |
| `schema`     | `StandardSchemaV1<unknown, T>`                | none             | Validates every value read from storage. Synchronous schemas only.                                                                                                      |
| `version`    | `number` (integer ≥ 1)                        | none (0)         | The current shape version. Stored values with a lower version go through `migrate`.                                                                                     |
| `migrate`    | `(stored: unknown, fromVersion: number) => T` | none             | Upgrades an older stored value. Required when `version` is set.                                                                                                         |
| `expires`    | `number` (days) or `Date`                     | cookie: `365`    | Cookies: the cookie's expiry; `0` is a session cookie, a negative number throws. Web Storage: honoured on read; an expired value is removed. Recomputed on every write. |
| `namespace`  | `string`                                      | none             | Prefix; the stored name becomes `` `${namespace}:${key}` ``.                                                                                                            |
| `debounceMs` | `number`                                      | `0`              | Delays storage writes; memory and subscribers update at once.                                                                                                           |
| `sync`       | `boolean`                                     | `true`           | Follow changes made in other tabs.                                                                                                                                      |
| `serializer` | `Serializer<T>`                               | JSON             | `{ serialize(value: T): string; deserialize(text: string): unknown }`.                                                                                                  |
| `consent`    | `() => boolean`                               | none (allowed)   | While it returns `false`, storage is neither read nor written. See [Consent](#consent).                                                                                 |
| `onError`    | `(error: PersistentStateError) => void`       | `console.warn`   | Receives every read, write, validation and migration failure.                                                                                                           |
| `path`       | `string`                                      | `'/'`            | Cookie only.                                                                                                                                                            |
| `domain`     | `string`                                      | none             | Cookie only.                                                                                                                                                            |
| `secure`     | `boolean`                                     | `true` on https  | Cookie only.                                                                                                                                                            |
| `sameSite`   | `'strict' \| 'lax' \| 'none'`                 | `'lax'`          | Cookie only.                                                                                                                                                            |

Cookie-only options are typed `never` when `storage` is not `'cookie'`, as in 0.2.1. `persistentState` throws a
`TypeError` for an empty key, for `version` without `migrate`, and for `migrate` without `version`.

### The definition object

```ts
interface PersistentState<T, S extends StorageKind> {
  readonly key: string // the full stored name, namespace included
  readonly storage: S
  readonly defaultValue: T
  get(): T
  set(next: T | ((prev: T) => T)): void
  reset(): void
  subscribe(listener: () => void): () => void
  isPersistent(): boolean
}
```

- `get()` returns the current value. The first call in a page reads storage through the
  [read pipeline](#read-pipeline); later calls return the cached value, so object values keep their identity.
- `set()` updates memory and notifies subscribers synchronously, then writes through the
  [write pipeline](#write-pipeline). Setting a value `Object.is`-equal to the current one does nothing. Setting
  `undefined` is the same as `reset()`.
- `reset()` sets the value to `default`, notifies, and removes the stored item, including every legacy cookie name
  variant. Removal happens even when the consent predicate returns `false`.
- `subscribe()` is called on value changes and on `isPersistent` changes.
- On the server (no `document`), `get()` returns `default`, `subscribe()` returns a no-op unsubscribe, and `set()` and
  `reset()` throw an `Error` that names `readState()` and Server Actions.

Every definition with the same `storage` and full key shares one in-memory record (value, listeners, debounce timer),
kept on `globalThis` so it survives hot module reloading. The options of each definition apply to its own reads and
writes.

### `useStoredState(def)` (`/react`)

```ts
function useStoredState<T, S extends StorageKind>(
  def: PersistentState<T, S>,
): [value: T, setValue: (next: T | ((prev: T) => T)) => void, meta: StoredStateMeta]

interface StoredStateMeta {
  reset(): void
  isPersistent: boolean
}
```

Built on `useSyncExternalStore(def.subscribe, def.get, getServerSnapshot)`. `setValue` and `meta.reset` are stable
across renders. The tuple shape follows `use-local-storage-state`, which agents and users already know. `isPersistent`
is `true` during server rendering and hydration and reflects the real state afterwards.

### `usePersistentState(key, initial, options?)` (`/react`)

```ts
function usePersistentState<T>(
  key: string,
  initial: T | (() => T),
  options?: UsePersistentStateOptions<T>,
): [value: T, setValue: (next: T | ((prev: T) => T)) => void, meta: StoredStateMeta]
```

For one-off keys. It builds a definition from `key`, `initial` (lazy when a function) and `options` (every
`persistentState` option except `default`) and calls `useStoredState`. It keeps 0.2.1's signature; the third tuple
element is new. The 0.2.1 option names `storageType` and `syncAcrossTabs` are accepted as deprecated aliases of
`storage` and `sync` until 1.0.0.

### `CookieValuesProvider` (`/react`)

```tsx
function CookieValuesProvider(props: { cookies: Record<string, string> | string; children: ReactNode }): ReactElement
```

Supplies cookie values for server rendering and hydration, as a name-to-raw-value record or a `Cookie` header string.
Next.js apps use `PersistentStateProvider` from `/next` instead, which renders this component. Other React SSR
frameworks pass the request's cookies.

### `PersistentStateProvider` (`/next`)

```tsx
async function PersistentStateProvider(props: {
  states: PersistentState<unknown, 'cookie'>[]
  children: ReactNode
}): Promise<ReactElement>
```

A Server Component. It reads, through `cookies()` from `next/headers`, only the cookies of the listed definitions
(every legacy name variant), and renders `CookieValuesProvider` with their raw values. Other cookies never reach the
client. Like every `cookies()` call, it makes the route dynamic; the docs say to place it in the layout that needs it.

### `readState(def)` (`/next`)

```ts
async function readState<T>(def: PersistentState<T, 'cookie'>): Promise<T>
```

Reads a cookie definition in a Server Component, Server Action or Route Handler: `readCookieState(def, await cookies())`.
Passing a non-cookie definition is a type error.

### `readCookieState(def, cookies)` (core)

```ts
function readCookieState<T>(def: PersistentState<T, 'cookie'>, cookies: CookieSource | string): T

interface CookieSource {
  get(name: string): { value: string } | undefined
}
```

The framework-free server read, for any runtime: `CookieSource` matches Next.js's request cookies and 0.2.1's
`PersistentCookieStore`; a string is parsed as a `Cookie` header. It runs the [read pipeline](#read-pipeline) without
writing back and without evaluating the consent predicate (cookies exist only if they were written with consent).

### `refreshConsent()` (core)

Re-evaluates the consent predicate of every definition used in the page. See [Consent](#consent).

### `PersistentStateError` (core)

```ts
class PersistentStateError extends Error {
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

### Deprecated, removed in 1.0.0

- `getPersistentCookieItem(store, key)` and `getPersistentCookieValue(store, key)` keep their 0.2.1 behavior; the
  JSDoc points to `readCookieState`.
- `PersistentCookieStore` is an alias of `CookieSource`; `StorageType` of `StorageKind`.
- `usePersistentState` options `storageType` and `syncAcrossTabs`.

### Removed in 0.3.0

- `PersistentStateCookiesProvider` (the re-exported `next-client-cookies` provider). No provider is needed except to
  render cookie values on the server.
- `useStorage`, `StorageAPI`, `StorageOptions`, `CookieStorageOptions`, `NonCookieStorageOptions`: replaced by the
  definition object.
- `usePersistentState` from the root entry: it moves to `/react`, so the core has no React dependency.

## Behavior

### Read pipeline

Runs on the first `get()` in a page, on a cross-tab update, after `refreshConsent()` grants consent, and in
`readCookieState`:

1. **Consent.** In the browser, when `consent` returns `false`, storage is not read; the value is `default` (or the
   value set in memory this page).
2. **Raw text.** Web Storage: `getItem(fullKey)`. Cookies: the first present name among the canonical name, the raw
   key, `encodeURIComponent(key)` and `encodeURIComponent(encodeURIComponent(key))`; the value is URI-decoded once as
   js-cookie's read converter does, and if JSON parsing fails, with up to two more passes of the same converter. A
   percent-escape that is not valid UTF-8 cannot be decoded: the cookie is left in place and the read reports
   `parse-failed`.
   js-cookie's stripping of surrounding double quotes is deliberately dropped: Next.js's request cookies keep them, and
   the browser and the server must decode a value the same way. No text
   means `default`.
3. **Decode.** With a custom `serializer`, `deserialize(text)`. Otherwise `JSON.parse(text)`, with the legacy rule:
   when parsing fails, or when `default` is a string and the parsed value is not a string, the raw text is the value.
   This reads 0.2.1's raw strings correctly.
4. **Envelope.** A parsed object with `__ps: 1` is an envelope (see [Stored format](#stored-format)); an object whose
   `__ps` is set to anything else was written in a newer envelope format, so it reports `version-ahead`, yields
   `default` and is never written back; anything else is a plain value with version 0 and no expiry.
5. **Version ahead.** A stored version above `version` reports `version-ahead` and yields `default`; the item is left
   untouched for the newer code that wrote it. This is checked before expiry, so an item of a newer version is never
   removed, even when it is past `exp`.
6. **Expiry.** A Web Storage envelope past `exp` means `default`; the item is removed (browser only).
7. **Migration.** A stored version below `version` goes through `migrate(value, storedVersion)`; a throw, or a result
   of `undefined`, reports `migrate-failed` and yields `default`.
8. **Validation.** With a `schema`, `schema['~standard'].validate(value)`. Issues, or a result that is `null` or
   `undefined`, report `invalid` (with the issues, if any); a returned Promise reports `async-schema`; both yield
   `default`.
9. **Write-back.** In the browser, a migrated value is written back once so migration runs once per stored item.

A throwing `deserialize`, a malformed envelope or a cookie value that cannot be decoded reports `parse-failed` and
yields `default`.

A read that yields `default` because of `invalid`, `async-schema`, `migrate-failed` or `version-ahead` never writes to
or removes the stored item. `set()` replaces it and `reset()` removes it, so withdrawing consent deletes it.

### Write pipeline

1. Memory updates and subscribers are notified synchronously.
2. When `consent` returns `false` or storage is unavailable, nothing is written and `isPersistent` is `false`.
3. With `debounceMs > 0`, the write waits; a newer `set()` restarts the wait. Pending writes flush on `pagehide` and on
   `visibilitychange` to `hidden`. There is no `beforeunload` listener, so the page stays eligible for the
   back/forward cache.
4. The value is serialized (JSON or `serializer`), wrapped in an envelope when `version` or Web Storage `expires` is
   set, and written.
5. A cookie write is verified by reading `document.cookie` back. A missing cookie (blocked, or over the browser's size
   limit) and a throwing `setItem` (quota) report `write-failed` and set `isPersistent` to `false`; a later successful
   write sets it back to `true`.
6. After a successful cookie write, a message is posted on the `BroadcastChannel` named `persistent-state`.

### Stored format

- Without `version` or Web Storage expiry, the stored text is the serialized value, as in 0.2.1, so 0.2.1 readers keep
  working during a migration. Every value, strings included, goes through the serializer: `"42"` is stored as `"42"`
  with its quotes (bug 1).
- With either, the stored text is the JSON envelope `{"__ps":1,"v":<value>,"ver":<version>,"exp":<epoch ms>}`, omitting
  absent fields. With a custom serializer, `v` holds the serialized string.
- Cookie names and values are encoded exactly as js-cookie 3 does, which 0.2.1 used in the browser through
  `next-client-cookies`: names with `encodeURIComponent`, then `#`, `$`, `&`, `+`, `^`, the backtick and `|` restored and `(` `)` escaped; values with
  `encodeURIComponent`, then the characters js-cookie leaves readable restored. New cookies are therefore readable by
  0.2.1's `getPersistentCookieItem`, and 0.2.1's cookies by 0.3.0. Attributes: `path`, `domain`, `secure`, `sameSite`,
  `expires` from the options.

### SSR and hydration

The server snapshot `useStoredState` gives React must equal what the server rendered, on the server and during
hydration on the client:

| Storage                          | Server render                                | Hydration (client server snapshot)        | After hydration                                      |
| -------------------------------- | -------------------------------------------- | ----------------------------------------- | ---------------------------------------------------- |
| `cookie`, listed in a provider   | value decoded from the provider's raw cookie | the same raw cookie, decoded the same way | `document.cookie`, normally the same value: no flash |
| `cookie`, no provider value      | `default`                                    | `default`                                 | the stored value; one render with `default`          |
| `localStorage`, `sessionStorage` | `default`                                    | `default`                                 | the stored value; one render with `default`          |

The server never reads Web Storage, and the client never reads storage inside `getServerSnapshot` (bug 2). Decoded
provider values are cached per raw string so the snapshot is referentially stable. In development, a cookie definition
rendered on the server under a provider that does not list it logs one warning naming the key. The docs recommend
`storage: 'cookie'` for state the first paint depends on, such as a theme or a sidebar's open state.

### Cross-tab and same-tab sync

- Same tab: every hook and definition with the same storage and full key shares one record and re-renders together.
- `localStorage` (when `sync` is `true`): `storage` events for the full key re-run the read pipeline; a `storage` event
  with `key === null` (another tab called `clear()`) re-reads every `localStorage` definition.
- `cookie` (when `sync` is `true`): `BroadcastChannel` messages carry only the definition id; the receiver re-reads
  `document.cookie` rather than trusting the payload. A browser can deliver the message before the other page's cookie
  change is visible in `document.cookie`, so a re-read that finds no change is repeated once, 50 ms later. Cookie
  definitions also re-read on `visibilitychange` to `visible`, which picks up cookies set by the server while the tab
  was in the background.
- `sessionStorage` is per tab by design and is never synced across tabs.
- Values held in memory (fallback or no consent) are never synced.

### Fallback and errors

- Availability is probed lazily on first use, including when that use is `set()` or `reset()`: a Web Storage
  write-and-remove of a probe key, `navigator.cookieEnabled` for cookies. A failed probe reports `unavailable` once per
  record, one for each key and storage in a page, however often the record is read again; the value lives in memory for
  the page and `isPersistent` is `false`.
- A full Web Storage counts as available: a `QuotaExceededError` from the probe still lets stored values be read and
  removed, and a later write that does not fit reports `write-failed`.
- No public function throws because of storage, except the server-side `set()` and `reset()` and the option checks
  in `persistentState`. Every failure goes to `onError` as a `PersistentStateError`.
- The default `onError` logs with `console.warn` and a `[persistent-state]` prefix; `onError: () => {}` silences it.
- An `onError` that throws is caught and logged with `console.error` and the same prefix; it is not called again, and
  the error never reaches the caller of `get()`, `set()` or a hook render.

### Consent

`consent` is a plain predicate, so the package has no dependency on any consent manager:

- While it returns `false`, storage is neither read nor written, the value lives in memory (starting at `default`),
  and `isPersistent` is `false`.
- It is evaluated on first use, before every write, and by `refreshConsent()`. When it changes to `true`, a value set
  in memory during the page is written; otherwise the stored value is read and subscribers are notified.
- `reset()` always removes the stored item, so withdrawing consent can delete what was stored.
- No stored item is deleted automatically when the predicate returns `false`, because a consent manager that has not
  loaded yet may return `false` transiently.

With ConsentLayer, the documented wiring is:

```ts
const theme = persistentState('theme', {
  default: 'system',
  storage: 'cookie',
  consent: () => analytics.consent.getConsent()?.preferences === true,
})
analytics.consent.subscribe(({ consent }) => {
  if (!consent?.preferences) theme.reset()
  refreshConsent()
})
```

The docs must not say that any setup complies with a law; they link to ConsentLayer's legal notice for that topic.

## Changes from 0.2.1 and migration

| 0.2.1                                                                          | 0.3.0                                                                                                    |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Installed from GitHub Packages with an `.npmrc` scope mapping and a read token | Installed from npm. Remove the `@nicolopadovan:registry=https://npm.pkg.github.com` line and the token   |
| `import { usePersistentState } from '@nicolopadovan/persistent-state'`         | `import { usePersistentState } from '@nicolopadovan/persistent-state/react'`                             |
| `<PersistentStateCookiesProvider>` required around every use                   | Remove it. For cookie state rendered on the server, `PersistentStateProvider` from `/next` with `states` |
| `next-client-cookies` peer dependency                                          | Remove it if nothing else uses it                                                                        |
| `useStorage(type)`                                                             | `persistentState()` and its `get`, `set`, `reset`                                                        |
| `getPersistentCookieItem(await cookies(), key)`                                | `readState(def)` (deprecated function kept until 1.0.0)                                                  |
| `syncAcrossTabs` default `false`                                               | `sync` default `true`; pass `sync: false` for the old behavior                                           |
| Cookie without `expires` is a session cookie                                   | Cookie `expires` defaults to 365 days; `expires: 0` writes a session cookie                              |
| Two-element tuple                                                              | Three elements; the third is `{ reset, isPersistent }`                                                   |
| Strings stored raw                                                             | Strings stored as JSON; raw strings written by 0.2.1 still read correctly                                |

The legacy rule for raw strings keys on `typeof default`. A state whose default is not a string, such as `null` typed
`string | null`, reads a raw 0.2.1 value that parses as JSON (`42`, `true`) as that number or boolean; a `schema`
reports it as `invalid` and yields `default`. Such states must re-save their value, or give a string `default`.

The migration page covers this for projects on 0.2.x and for projects that vendored a copy of the source as
`@workspace/persistent-state`, without naming any project. Stored data needs no migration.

## Package layout

Copied from ConsentLayer, with these names:

```
.changeset/config.json            # access public, baseBranch main
.github/
  CODEOWNERS                      # * @nicolopadovan
  dependabot.yml  pull_request_template.md  ISSUE_TEMPLATE/{bug_report,feature_request,config}.yml
  workflows/ci.yml                # jobs: check, min-versions, secrets
  workflows/docs.yml              # GitHub Pages deploy
  workflows/publish-package.yml   # Release (replaces the GitHub Packages publish.yml)
.actrc  .gitignore  .prettierignore  prettier.config.mjs  eslint.config.mjs  knip.json
package.json  pnpm-workspace.yaml  turbo.json  tsconfig.base.json  vitest.config.ts
AGENTS.md  CLAUDE.md (@AGENTS.md)  CONTRIBUTING.md  CODE_OF_CONDUCT.md  SECURITY.md  SUPPORT.md  LICENSE  README.md
docs/spec.md  docs/plan.md  docs/publishing-and-releases.md
packages/persistent-state/
  package.json  tsup.config.ts  .size-limit.js  tsconfig.json  vitest.config.ts  vitest.browser.config.ts
  AGENTS.md                       # shipped in the tarball: usage rules for agents
  README.md  LICENSE  CHANGELOG.md
  src/index.ts  src/core/*  src/react/index.ts  src/next.tsx
  test/*.test.ts(x)  test/browser/*.test.ts(x)  test/types/*
apps/docs                         # Astro Starlight, public/CNAME persistent-state.nicolopadovan.com
apps/example-next                 # App Router, cookie state rendered on the server
apps/example-react                # Vite, localStorage
```

Package `package.json`: `"type": "module"`, `files: ["dist", "AGENTS.md"]`, `sideEffects: false`, `engines.node >=22`,
`publishConfig.access: public` (no GitHub registry), `repository.directory`, `homepage`, `bugs`, the browserslist of
ConsentLayer (`chrome >= 94`, `edge >= 94`, `firefox >= 93`, `safari >= 15.4`, `ios_saf >= 15.4`; it covers
`BroadcastChannel`), no `dependencies`, and optional peers `react: ^18.3.0 || ^19.0.0` and
`next: ^15.0.0 || ^16.0.0` (0.2.1 required `next-client-cookies` 2, which supports Next.js 15 and later). Exports
`"."`, `"./react"`, `"./next"`, `"./package.json"`, ESM only, each with `types` and `import`. tsup builds ESM with
declarations and source maps, keeps `react`, `next` and `@nicolopadovan/persistent-state*` external (so `/next` imports
the `'use client'` module from `/react` rather than inlining it), and prepends `'use client'` to `dist/react/index.js`
after the build, as ConsentLayer does.

The shipped `AGENTS.md` opens by saying it is for agents using the package and that contributors read the repository
root's `AGENTS.md`. It covers: declare each key once at module scope; which storage the server can read; never read
storage in render paths outside the hooks; use `PersistentStateProvider` for cookie state the first paint needs; schema
and `version` together for any shape that may change; `consent` for non-essential state; values are visible to the
visitor and to page scripts; the import map of entry points; and links to `llms-full.txt`.

## Quality bars and checks

- Prettier at 120 columns (ConsentLayer's config), ESLint flat config with `typescript-eslint` type-checked rules,
  `react-hooks`, `eslint-plugin-compat` on `src` except `src/next.tsx`, and `eslint-plugin-jsdoc` requiring a doc
  comment on every exported function, class, type and option property in `packages/persistent-state/src`. Lint warnings
  fail.
- Knip on every workspace.
- tsup ESM build; `check:package` runs `publint`, `attw --pack . --profile esm-only`, `size-limit`, and `es-check`
  against the browserslist for `dist/**/*.js` except `dist/next.js`.
- Size budgets in `.size-limit.js` for the core, the core tree-shaken to `persistentState` alone, `/react` and
  `/next`. Each budget is set when its entry lands, at the measured size plus about 10%. A feature that grows an entry
  raises its budget; code is never trimmed to pass one.
- Vitest unit tests in jsdom for the core, `/react` and `/next` (with `next/headers` mocked), plus type tests
  (`test/types`, checked by `tsc`) including inference from a zod 4 schema.
- Vitest browser mode with Playwright in Chromium: real `document.cookie`, cross-tab `storage` and `BroadcastChannel`
  events between the test page and a same-origin iframe, and `hydrateRoot` over server-rendered HTML with no
  recoverable error and no `console.error`.
- CI (`.github/workflows/ci.yml`): `check` (format, knip, `turbo run typecheck lint test build`, browser tests,
  `check:package`), `min-versions` (React 18.3.0, react-dom 18.3.0, their types 18.3.0, Next.js 15.0.0, then the package
  typecheck and tests), `secrets` (gitleaks over full history). Every job runs locally under `act` with ConsentLayer's
  `.actrc`.
- Repository rules after the repository is public: squash merges only with the PR title and body; the `main` ruleset
  (no deletion, no force push, linear history, pull request, required checks `check`, `min-versions`, `secrets`, admin
  bypass for pull requests); the tag ruleset on `refs/tags/v*` (no deletion, update or force push); `CODEOWNERS`;
  Discussions; private vulnerability reporting.

## Release and versioning

- Every 0.x minor may contain breaking changes; patches never do. The package README, the docs home page and the
  installation page say so. 1.0.0 follows the roadmap core and removes the deprecated aliases.
- Changesets as in ConsentLayer (`access: public`, `baseBranch: main`). One changeset with a `minor` bump takes 0.2.1
  to 0.3.0 and describes the release.
- `.github/workflows/publish-package.yml` copies ConsentLayer's Release workflow: on `main`, `changesets/action` opens
  "Release persistent-state"; once no changeset is pending and the version is not on npm, the `publish` job waits in
  the `npm` environment, re-runs the package checks, runs `npm publish` from `packages/persistent-state` with trusted
  publishing (OIDC, `id-token: write`, provenance; no token), publishes versions with a prerelease suffix under the
  `next` dist-tag, and pushes the annotated tag `v<version>`, as the archived repository's `v0.1.0` to `v0.2.1` tags
  were; those tags do not exist in the public repository, whose first tag is `v0.3.0`.
- The GitHub Packages workflow (`.github/workflows/publish.yml`, triggered by `v*` tags) is deleted in the same card,
  so the new tags never publish to GitHub Packages.
- Each version is a GitHub milestone with its issues, as in ConsentLayer; new requests go to the next open milestone.
- `docs/publishing-and-releases.md` documents the one-time setup and the release steps, adapted from ConsentLayer's.

## Docs plan

Astro Starlight in `apps/docs`, `site: https://persistent-state.nicolopadovan.com`, `starlight-llms-txt` with
`rawContent: true` producing `/llms.txt` and `/llms-full.txt` from every page except the changelog, an edit link, the
GitHub social link, ConsentLayer's `routeData.ts` heading sidebar, and sidebar groups generated from directories
(ordered by `sidebar.order`) so pages can be added in parallel. Tone: the Next.js docs, as ConsentLayer's docs —
complete professional sentences, technical, every fact checked against `packages/persistent-state/src`, depth in
`<details>`. Prose names the product **persistent-state**, code uses the full package name.

| Page                               | Content                                                                                                                                                                                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Introduction (`index.mdx`)         | What it is, who it is for, the 0.x stability notice, where to go next                                                                                                                                                                          |
| Getting started                    | Requirements table, install with package-manager tabs, entry points, declaring a key, using it in React, a quick Next.js example                                                                                                               |
| Choosing a storage                 | Cookie vs `localStorage` vs `sessionStorage`: lifetime, size limits, what the server can read, tab scope, sync, cost of sending cookies on every request, privacy                                                                              |
| Next.js App Router                 | `PersistentStateProvider`, `readState`, the no-flash rule, dynamic rendering, what the old `CookiesProvider` cost (a provider and a dependency for every use, `cookies()` in the root layout making every route dynamic), Server Actions today |
| Schemas and migrations             | Standard Schema (zod, valibot, arktype), the fallback to `default`, `version` and `migrate`, expiry, the envelope, write-back                                                                                                                  |
| Consent                            | The predicate, `refreshConsent`, `reset` on withdrawal, wiring to ConsentLayer's `preferences` category, no compliance claims                                                                                                                  |
| API reference (`reference/api.md`) | Every export by entry point: signature, options with types and defaults, return value, errors                                                                                                                                                  |
| How it works (`internals/`)        | The shared record, read and write pipelines, cookie encoding, hydration snapshots, cross-tab transport, flush on `pagehide`                                                                                                                    |
| Migrating                          | From 0.2.x and from vendored `@workspace/persistent-state` copies; generic, no project names                                                                                                                                                   |
| Comparison                         | use-local-storage-state, usehooks-ts, zustand `persist`, jotai `atomWithStorage`, Mantine hooks; facts dated 2026-10-15                                                                                                                        |
| Roadmap                            | The table below, linked to the milestones                                                                                                                                                                                                      |
| Changelog                          | Rendered from `packages/persistent-state/CHANGELOG.md`, as ConsentLayer does                                                                                                                                                                   |

Comparison facts, researched 2026-10-15: use-local-storage-state 20.0.0 (about 895K weekly downloads, zero
dependencies, in-memory fallback and `isPersistent`, `defaultServerValue`, `storage` event and same-tab sync; no
validation, migrations, expiry or cookies). usehooks-ts 3.1.1 (about 6.2M weekly, depends on `lodash.debounce`,
`serializer`, `initializeWithValue` for SSR; no cookies). zustand `persist` (`version`, `migrate`, `partialize`; no
built-in cross-tab sync; custom and async storage). jotai `atomWithStorage` (custom storage, an unstable validator,
`getOnInit`). Mantine hooks (`localStorage` and `sessionStorage`, sync on by default). None of them combines cookies
and Web Storage under one React API with server-side reads, and none offers consent gating or debounced writes flushed
on page hide.

## Roadmap

1.0.0 follows the roadmap core (0.4.0 to 0.11.0). Each row is its own version and GitHub milestone, in this order:

| Version | Item                                                                                                                                                                                                                                                                                                              | Priority |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 0.4.0   | Server writes: `writeState` and `resetState` in `/next` for Server Actions and Route Handlers; core `serializeStateCookie` for other servers                                                                                                                                                                      | High     |
| 0.5.0   | Static rendering with cookie state: a documented static mode with a `hydrated` flag; `PersistentStateProvider` inside `<Suspense>` with Cache Components; `<PersistentStateScript>` for attributes or CSS variables before the first paint; a middleware rewrite helper for prerendered variants per cookie value | High     |
| 0.6.0   | Vue binding (`/vue` composable) and Nuxt server reads                                                                                                                                                                                                                                                             | High     |
| 0.7.0   | Svelte binding (`/svelte`) and SvelteKit server reads                                                                                                                                                                                                                                                             | Medium   |
| 0.8.0   | Solid binding (`/solid`) and SolidStart server reads                                                                                                                                                                                                                                                              | Medium   |
| 0.9.0   | Async storage: a storage driver interface, an IndexedDB driver, and the loading state hooks need for it (also covers React Native storage)                                                                                                                                                                        | High     |
| 0.10.0  | URL-state interop: seed a definition from a search parameter and mirror it back, for shareable links                                                                                                                                                                                                              | Medium   |
| 0.11.0  | Devtools: an `inspect()` API listing every definition, its value, storage and persistence, and a small in-page panel                                                                                                                                                                                              | Low      |
| 1.0.0   | API freeze: deprecated aliases removed, semver guarantees from here on                                                                                                                                                                                                                                            | High     |
| 1.1.0   | Interop: a zustand `persist` storage and a jotai `atomWithStorage` storage backed by definitions                                                                                                                                                                                                                  | Low      |
| 1.2.0   | Server-synced storage: a driver that syncs through an endpoint you provide, across devices, with an offline queue                                                                                                                                                                                                 | Medium   |
| 1.3.0   | A hosted sync backend (under consideration; depends on 1.2.0 being used)                                                                                                                                                                                                                                          | Low      |

## Acceptance criteria

Each criterion is checked by the command or observation it names. "The package" is `packages/persistent-state`;
`pnpm --filter @nicolopadovan/persistent-state` is abbreviated `pnpm -F pkg`.

- **AC-1** The repository is a pnpm and Turborepo monorepo with `packages/persistent-state`, `apps/docs`,
  `apps/example-next` and `apps/example-react`, ConsentLayer's root configs adapted, and `pnpm install` followed by
  `pnpm format:check`, `pnpm knip` and `pnpm turbo run typecheck lint test build` passes.
- **AC-2** The package's `package.json` has no `dependencies`; `react` and `next` are optional peers with the ranges in
  [Package layout](#package-layout); `git grep -n next-client-cookies -- packages apps/example-*` finds nothing.
- **AC-3** The entry points `.`, `./react` and `./next` exist in `exports` and `tsup.config.ts`, each has a size budget,
  `pnpm -F pkg check:package` passes, and `dist/index.js` contains no import of `react` or `next`.
- **AC-4** A unit test proves the strings `"42"`, `"true"`, `"null"` and `""` round-trip as strings in all three
  storages, and that a raw `42` written by 0.2.1 for a definition whose default is a string reads as `"42"`.
- **AC-5** A browser test renders a `localStorage` and a `sessionStorage` definition to HTML with `default`, stores a
  different value, hydrates with `hydrateRoot`, and observes no `onRecoverableError` call, no `console.error`, and the
  stored value after hydration.
- **AC-6** A unit test renders `useStoredState` with `localStorage` and with `cookie` storage with no provider of any
  kind; the root entry exports no provider.
- **AC-7** A browser test server-renders a cookie definition inside `CookieValuesProvider`, hydrates it, and observes
  the stored value in the HTML before hydration, no hydration error, and no change after hydration. Running
  `apps/example-next` with `next start` and `curl -H 'Cookie: <theme cookie>' http://localhost:3000/` returns HTML that
  contains the stored theme.
- **AC-8** Unit tests with `next/headers` mocked prove that `readState` returns the decoded, migrated and validated
  value, and that `PersistentStateProvider` passes only the listed definitions' cookies to `CookieValuesProvider`.
- **AC-9** A unit test proves `reset()` removes the stored item (every cookie name variant), sets `default`, and
  notifies every subscriber of the key, also while the consent predicate returns `false`.
- **AC-10** Browser tests with a same-origin iframe prove `localStorage` changes arrive through `storage` events and
  cookie changes through `BroadcastChannel`, both by default; `sync: false` stops both; `sessionStorage` is not synced.
- **AC-11** Unit tests prove that throwing storage yields a working in-memory value with `isPersistent` `false` and
  `onError` code `unavailable`; a quota error on write yields `write-failed`; a cookie that does not read back yields
  `write-failed`; a later successful write restores `isPersistent`.
- **AC-12** Unit tests prove a Standard Schema rejection yields `default` and `onError` code `invalid` with the issues,
  and an async schema yields `async-schema`; a type test proves `T` is inferred from a zod 4 schema's output.
- **AC-13** Unit tests prove `migrate` receives the stored value and version (0 for plain 0.2.1 values), its result is
  validated and written back once, a throw yields `migrate-failed`, and a higher stored version yields `version-ahead`
  with the item left in storage.
- **AC-14** Unit tests prove an expired Web Storage envelope yields `default` and removes the item, that a number means
  days, and that each write recomputes expiry.
- **AC-15** Unit tests with spied storage prove that while `consent` returns `false` storage is never read or written
  and `isPersistent` is `false`; after `refreshConsent()` with the predicate `true`, a value set in memory is written,
  otherwise the stored value is read. A test drives it from an object shaped like ConsentLayer's `analytics.consent`
  without importing ConsentLayer.
- **AC-16** Unit tests prove debounced writes wait `debounceMs`, restart on a newer `set()`, and flush on `pagehide` and
  on `visibilitychange` to `hidden`; no `beforeunload` listener is added.
- **AC-17** Unit tests prove two hooks, and two definitions, with the same storage and full key stay in sync in one
  tab, and that `namespace` produces the stored name `namespace:key`.
- **AC-18** Unit tests with fixtures written in 0.2.1's formats (raw, encoded and double-encoded cookie names;
  URI-encoded and double URI-encoded values; raw Web Storage strings) read correctly, and a cookie written by 0.3.0 is
  read by a copy of 0.2.1's `getPersistentCookieItem` kept in the test fixtures.
- **AC-19** Unit tests prove `usePersistentState(key, initial, options)` works with a lazy `initial` and with the
  deprecated `storageType` and `syncAcrossTabs` aliases.
- **AC-20** ESLint with `eslint-plugin-jsdoc` requires a doc comment on every export and option property of the
  package's `src`, and passes.
- **AC-21** `npm pack --dry-run` in the package lists only `dist/**`, `AGENTS.md`, `README.md`, `LICENSE` and
  `package.json`; the shipped `AGENTS.md` covers the topics in [Package layout](#package-layout).
- **AC-22** `pnpm -F pkg test:browser` passes in Chromium headless shell and contains the tests of AC-5, AC-7 and
  AC-10.
- **AC-23** `.github/workflows/ci.yml` has the jobs `check`, `min-versions` and `secrets` as specified, and each passes
  under `act pull_request -j <job> -W .github/workflows/ci.yml` with the repository's `.actrc`.
- **AC-24** `.changeset/config.json` and `.github/workflows/publish-package.yml` match [Release](#release-and-versioning);
  `.github/workflows/publish.yml` no longer exists; `pnpm changeset status` reports a minor bump of the package to
  0.3.0; `docs/publishing-and-releases.md` describes the setup and steps.
- **AC-25** `pnpm turbo run build --filter=docs` passes; `apps/docs/dist` contains `llms.txt`, `llms-full.txt` and
  every page in the [Docs plan](#docs-plan); `apps/docs/public/CNAME` is `persistent-state.nicolopadovan.com`;
  `.github/workflows/docs.yml` deploys `apps/docs/dist` to Pages.
- **AC-26** `apps/example-next` (cookie theme rendered on the server through `PersistentStateProvider`, a debounced
  `localStorage` value) and `apps/example-react` (Vite, `localStorage` with a schema and a migration) typecheck, lint
  and build in the turbo run.
- **AC-27** A case-insensitive `git grep` over the tracked files for the private project names Nico listed, and for the
  internal ticket tags in 0.2.1's lint comments, finds nothing. The names are supplied to the agent running the check
  and are not written in any tracked file.
- **AC-28** The root README, the package README and the docs home page state that 0.x minors may break; both READMEs
  carry an AI disclosure worded like ConsentLayer's and link the docs and `llms-full.txt`.
- **AC-29** The docs pages of the [Docs plan](#docs-plan) exist, the comparison page carries the facts above with
  their date, and the roadmap page carries the roadmap table.
- **AC-30** After Nico approves, `gh api repos/nicolopadovan/persistent-state/milestones` lists one milestone per
  roadmap version, each with an issue per item.
- **AC-31** After Nico makes the repository public and approves, `gh api` shows the settings and rulesets in
  [Quality bars](#quality-bars-and-checks), the `npm` environment with Nico as required reviewer, and Pages built by
  GitHub Actions on the custom domain with HTTPS enforced.

## Decisions

1. **Git history.** Decided 2026-10-15: the public repository starts from a fresh first commit holding this branch's
   tree. The current private repository is renamed (for example `persistent-state-archive`) and stays private as the
   archive, so the public one can take the name `nicolopadovan/persistent-state`. Nothing is force-pushed.
