---
title: Migrating
description: Upgrade to persistent-state 0.3.0 from 0.2.x or from a vendored copy of the source, with the code to change and what happens to the data already stored.
sidebar:
  order: 1
---

:::note
This page is for projects that already use persistent-state 0.2.x, published on GitHub Packages, or that vendored a copy
of its source as `@workspace/persistent-state`. If you are starting with persistent-state, skip it and follow
[Getting started](/start/getting-started/) instead.
:::

persistent-state 0.3.0 is the first release on the public npm registry. It replaces the 0.2.1 hooks with a definition
object created by `persistentState()`, moves `usePersistentState` to its own entry point, removes the dependency on
`next-client-cookies`, and changes a few defaults. The data your visitors already stored keeps working: **stored data
needs no migration**. This guide lists what to change in your code, then what to know about data that 0.2.1 wrote.

## Summary of changes

| 0.2.1                                                                          | 0.3.0                                                                                                                                      |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Installed from GitHub Packages with an `.npmrc` scope mapping and a read token | Installed from npm. [Remove the scope line and the token](#install-from-npm)                                                               |
| `import { usePersistentState } from '@nicolopadovan/persistent-state'`         | [Import it from `/react`](#move-the-imports)                                                                                               |
| `<PersistentStateCookiesProvider>` required around every use                   | [Remove it](#remove-the-provider-and-next-client-cookies). Cookie state rendered on the server uses `PersistentStateProvider` from `/next` |
| `next-client-cookies` peer dependency                                          | [Remove it](#remove-the-provider-and-next-client-cookies) if nothing else uses it                                                          |
| `useStorage(type)`                                                             | [`persistentState()`](#replace-usestorage) and its `get`, `set` and `reset`                                                                |
| `getPersistentCookieItem(await cookies(), key)`                                | [`readState(def)`](#read-cookies-on-the-server); the function stays, deprecated, until 1.0.0                                               |
| `syncAcrossTabs` default `false`                                               | `sync` default `true`; pass `sync: false` for the [old behavior](#renamed-options-and-new-defaults)                                        |
| Cookie without `expires` is a session cookie                                   | Cookie `expires` defaults to 365 days; `expires: 0` writes a session cookie                                                                |
| Two-element tuple                                                              | Three elements; the third is `{ reset, isPersistent }`                                                                                     |
| Strings stored raw                                                             | Strings stored as JSON; [raw strings written by 0.2.1 still read correctly](#strings-that-looked-like-numbers)                             |

## Requirements

| Requirement | 0.2.1                 | 0.3.0                                                            |
| ----------- | --------------------- | ---------------------------------------------------------------- |
| Node.js     | 20 or later           | 22 or later                                                      |
| React       | 18 or later           | 18.3 or later, or 19                                             |
| Next.js     | not a peer dependency | 15 or 16, only for the `/next` entry point; the peer is optional |
| Packaging   | ESM, one entry point  | ESM only, with the entry points `.`, `/react` and `/next`        |

## Install from npm

Remove the GitHub Packages registry mapping and the read token from `.npmrc`. If you install other `@nicolopadovan`
packages from GitHub Packages, keep the scope line.

```diff title=".npmrc"
-@nicolopadovan:registry=https://npm.pkg.github.com
-//npm.pkg.github.com/:_authToken=${GH_PACKAGES_READ_TOKEN}
```

Remove the `GH_PACKAGES_READ_TOKEN` secret from CI and the export from your shell profile if nothing else uses them.
Then update the dependency, and remove `next-client-cookies` in the same step:

```bash
npm install @nicolopadovan/persistent-state@^0.3.0
npm uninstall next-client-cookies
```

pnpm, yarn and bun use `add` and `remove` for the same two steps.

Every 0.x minor release may contain breaking changes, so pin the minor version, as the caret range above does for 0.x.

### Vendored copies

If your project imports persistent-state as `@workspace/persistent-state`, a workspace package that holds a copy of the
source, replace that package with the published one. Change the import specifier to
`@nicolopadovan/persistent-state`, move `usePersistentState` to `/react` as described below, delete the copy, and then
follow the rest of this page. Copies can diverge from each other and from 0.2.1, so check what yours exports against
[the table of removed exports](#move-the-imports). persistent-state 0.3.0 reads cookies under the raw, URI-encoded and
double URI-encoded form of a name, so a cookie written under any of those forms is still found.

## Move the imports

`usePersistentState` and its options type move from the root entry point to `/react`, so the core has no React
dependency.

```diff
-import { usePersistentState } from '@nicolopadovan/persistent-state'
-import type { UsePersistentStateOptions } from '@nicolopadovan/persistent-state'
+import { usePersistentState } from '@nicolopadovan/persistent-state/react'
+import type { UsePersistentStateOptions } from '@nicolopadovan/persistent-state/react'
```

These exports are removed in 0.3.0:

| Removed                                                                                         | Use instead                                                                           |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `PersistentStateCookiesProvider`                                                                | Nothing, or [`PersistentStateProvider`](#remove-the-provider-and-next-client-cookies) |
| `useStorage`, `StorageAPI`, `StorageOptions`, `CookieStorageOptions`, `NonCookieStorageOptions` | [`persistentState()`](#replace-usestorage) and the definition object it returns       |

## Remove the provider and next-client-cookies

0.2.1 read cookies in the browser through `next-client-cookies`, which needed `PersistentStateCookiesProvider` around
every component that used a hook. 0.3.0 reads and writes `document.cookie` itself. Delete the provider:

```diff title="app/layout.tsx"
-import { PersistentStateCookiesProvider } from '@nicolopadovan/persistent-state'
-
 export default function RootLayout({ children }: { children: React.ReactNode }) {
   return (
     <html lang="en">
-      <body>
-        <PersistentStateCookiesProvider>{children}</PersistentStateCookiesProvider>
-      </body>
+      <body>{children}</body>
     </html>
   )
 }
```

A provider is now needed only to render cookie state on the server. Declare the key with `persistentState()` in a module
that both server and client code can import, and list it in `PersistentStateProvider` from `/next`:

```ts title="lib/theme.ts"
import { persistentState } from '@nicolopadovan/persistent-state'

export const theme = persistentState('theme', { default: 'light', storage: 'cookie' })
```

```tsx title="app/layout.tsx"
import { PersistentStateProvider } from '@nicolopadovan/persistent-state/next'
import { theme } from '../lib/theme'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PersistentStateProvider states={[theme]}>{children}</PersistentStateProvider>
      </body>
    </html>
  )
}
```

`PersistentStateProvider` reads only the cookies of the definitions you list, so other cookies never reach the client.
Components read the value with `useStoredState(theme)` from `/react`. `usePersistentState` builds its definition
internally, so it cannot be listed in `states`: a cookie read through it renders `default` on the server and the stored
value after hydration. See [Next.js App Router](/guides/nextjs/) for the rendering rules.

## Replace `useStorage`

`useStorage(type)` returned an object with `getItem`, `setItem` and `removeItem` that took the key on every call. 0.3.0
declares each key once, with its default and options, and the definition carries the methods:

```tsx
// 0.2.1
const storage = useStorage('cookie')
const current = storage.getItem<string>('theme', 'light')
storage.setItem('theme', 'dark')
storage.removeItem('theme')
```

```tsx
// 0.3.0
import { persistentState } from '@nicolopadovan/persistent-state'
import { useStoredState } from '@nicolopadovan/persistent-state/react'

const theme = persistentState('theme', { default: 'light', storage: 'cookie' })

theme.get()
theme.set('dark')
theme.reset()

// In a component, subscribe to it:
const [value, setValue, { reset, isPersistent }] = useStoredState(theme)
```

## Read cookies on the server

`getPersistentCookieItem(await cookies(), key)` becomes `readState(def)`:

```diff title="app/page.tsx"
-import { cookies } from 'next/headers'
-import { getPersistentCookieItem } from '@nicolopadovan/persistent-state'
+import { readState } from '@nicolopadovan/persistent-state/next'
+import { theme } from '../lib/theme'

-const current = getPersistentCookieItem<string>(await cookies(), 'theme') ?? 'light'
+const current = await readState(theme)
```

`readState` returns the definition's `default` when no value is stored, where `getPersistentCookieItem` returned
`undefined`. For a server that is not Next.js, `readCookieState(def, cookies)` from the root entry point takes any object
with a `get(name)` method, or a `Cookie` header string.

`getPersistentCookieItem`, `getPersistentCookieValue`, `PersistentCookieStore` and `StorageType` still work in 0.3.0
with their 0.2.1 behavior, and are deprecated until 1.0.0. `PersistentCookieStore` is an alias of `CookieSource`, and
`StorageType` of `StorageKind`.

## Renamed options and new defaults

| 0.2.1                                                  | 0.3.0                                                                                                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `storageType`                                          | `storage`                                                                                                                                  |
| `syncAcrossTabs`, default `false`, `localStorage` only | `sync`, default `true`. `localStorage` follows `storage` events, cookies follow a `BroadcastChannel` message. `sessionStorage` never syncs |
| `expires` unset: a session cookie                      | `expires` defaults to 365 days, recomputed on every write. `expires: 0` writes a session cookie                                            |
| `secure` and `sameSite` sent only when set             | `secure` defaults to `true` on https, and `sameSite` to `'lax'`                                                                            |
| `onError` optional, errors ignored without it          | `onError` receives a `PersistentStateError`. Without it, errors go to `console.warn` with a `[persistent-state]` prefix                    |
| `setValue(undefined)` removed the item                 | `set(undefined)` calls `reset()`: the item is removed and the value becomes `default`                                                      |
| `[value, setValue]`                                    | `[value, setValue, { reset, isPersistent }]`                                                                                               |

The options `namespace`, `debounceMs`, `serializer`, `path` and `domain` keep their names. To keep the 0.2.1 sync, lifetime and
error behavior, set them explicitly:

```ts
const sidebar = persistentState('sidebar', {
  default: false,
  storage: 'cookie',
  sync: false,
  expires: 0,
  onError: () => {},
})
```

### Deprecated aliases

`usePersistentState` still accepts `storageType` and `syncAcrossTabs`, as aliases of `storage` and `sync`. If you pass
both an alias and its new name, the new name wins. The aliases are deprecated and removed in 1.0.0, so rename them now:

```diff
-const [open, setOpen] = usePersistentState('sidebar', false, { storageType: 'cookie', syncAcrossTabs: true })
+const [open, setOpen] = usePersistentState('sidebar', false, { storage: 'cookie', sync: true })
```

`persistentState()` does not accept the aliases.

## Stored data

Values written by 0.2.1 are read by 0.3.0 without a conversion step, and values written by 0.3.0 without `version` or a
Web Storage `expires` stay readable by 0.2.1. Four details differ, and each can change what a visitor sees after the
upgrade.

### Strings that looked like numbers

0.2.1 stored a string as it was and every other value as JSON, then tried to parse whatever it read as JSON. A string such as
`"42"` or `"true"` was written as the text `42` or `true`, and read back as the number `42` or the boolean `true`.

0.3.0 writes every value, strings included, as JSON, so `"42"` is stored with its quotes and reads back as a string. To
read what 0.2.1 wrote, it applies one rule on reading: when the `default` of the definition is a string, and the stored
text parses as JSON to something that is not a string, the stored text itself is the value. A raw `42` written by 0.2.1
therefore reads as the string `"42"` for a state whose `default` is a string.

<details>
<summary>How the rule reads a stored value</summary>

Without a custom `serializer`, 0.3.0 runs `JSON.parse` on the stored text. If parsing fails, the stored text is the
value; for cookies, it first tries up to two more `decodeURIComponent` passes. If parsing succeeds and the `default` is a
string but the result is not, the stored text is the value. With a custom `serializer`, the rule does not apply and
`deserialize(text)` decides.

</details>

### Null and nullable strings

A state that holds `null` stored the text `null` in 0.2.1. When 0.2.1 read it back, it treated `null` as nothing stored
and returned the initial value, so a `null` never survived a reload.

0.3.0 reads that text as `null` when the `default` is not a string, whatever the other types of the state are. A
`default` of `null`, a number, a boolean or an object all read it back as `null`. If a visitor's saved `null` used to
come back as the default, it now stays `null`.

### The nullable-string gap

The rule for raw strings keys on `typeof default`. A state typed `string | null` whose `default` is `null` is not a
string state, so a raw value that 0.2.1 wrote as `42` or `true` reads as the number `42` or the boolean `true`. With a
`schema` that expects a string, the value is reported as `invalid` and the state yields `default`.

This affects only values that 0.2.1 wrote and that have not been written again. Any `set()` stores the value as JSON,
after which it reads back as a string. To close the gap for such a state:

- Give the state a string `default`, such as `''`, and treat the empty string as "no value", or
- Without a `schema`, write the value back as a string once, for example `set(String(value))`, which stores it as JSON.

A state whose `default` is a string reads a stored `null` as the text `"null"`, because the parsed `null` is not a
string. `set(null)` on such a state therefore round-trips as `"null"`. Clear the value with `reset()` instead, or choose
a `default` that is not a string and keep `null` for "no value".

### Cookie expiry and rollouts

Cookies that 0.2.1 wrote without `expires` are session cookies. They keep that lifetime until the value is written
again, and every write after the upgrade sets a 365-day expiry, unless the definition sets `expires: 0`.

Setting `version`, or an `expires` on a Web Storage definition, stores the value in a JSON envelope that looks like
`{"__ps":1,"v":…}`. 0.2.1 cannot read it as the plain value. If old and new code run at the same time during a rollout,
adopt `version` and Web Storage `expires` after every instance runs 0.3.0.

## `reset()` and legacy cookies

`reset()` removes a cookie by writing an expired cookie with the definition's own `path`, `domain`, `secure` and
`sameSite`, under every name variant the definition can read. A browser identifies a cookie by its name, domain and
path. A legacy cookie that 0.2.1 set on a different `path` or `domain` than the definition's has a different identity,
so `reset()` does not remove it, and the value can come back on the next read.

The default `path` is `/`. If your 0.2.1 code set a custom `path` or `domain`, declare the same values on the
definition, and `reset()` removes that cookie:

```ts
const theme = persistentState('theme', { default: 'light', storage: 'cookie', path: '/app' })
```

The same mismatch affects writes. A browser lists the cookies of a name with the longest path first, and a definition
reads the first cookie of a name. A legacy cookie on a longer path than the definition's therefore shadows every value
the definition writes: `set()` reports `write-failed`, `isPersistent` becomes `false`, and a later page load reads the
legacy value. Declaring the matching `path` fixes this too. Web Storage is not affected, because `reset()` removes the
item by its exact key.

## Cookie name variants that alias

When 0.3.0 reads a cookie, it tries the names that 0.2.1 and its copies could have written, in this order: the
canonical name, the raw key, the URI-encoded key and the double URI-encoded key. The first name that has a cookie wins.
`reset()` removes every one of them.

Two different keys can therefore share a name. The key `a+b` reads `a+b`, `a%2Bb` and `a%252Bb`. The key `a%2Bb` reads
`a%252Bb`, `a%2Bb` and `a%25252Bb`. The two keys overlap on `a%2Bb` and `a%252Bb`: each can read a cookie that the other
wrote, when its own is absent, and `reset()` of one removes the cookie of the other. The same holds for `ns:key` and
`ns%3Akey`. Because `namespace` joins with a colon, a `namespace` of `ns` and a key of `key` also stores as
`ns%3Akey`.

Avoid `%` and characters that `encodeURIComponent` escapes in cookie keys, or keep every key distinct once encoded. Web
Storage uses the exact key and has no variants.

## Checklist

- Remove the GitHub Packages scope line and token, and install `@nicolopadovan/persistent-state@^0.3.0` from npm.
- Move `usePersistentState` and `UsePersistentStateOptions` to `@nicolopadovan/persistent-state/react`.
- Delete `PersistentStateCookiesProvider` and remove `next-client-cookies`.
- Replace `useStorage` with `persistentState()`.
- Replace `getPersistentCookieItem` with `readState`, and list cookie definitions in `PersistentStateProvider`.
- Rename `storageType` to `storage` and `syncAcrossTabs` to `sync`, and decide on `sync`, `expires` and `onError`.
- Check states typed `string | null`, and cookies that were set on a custom `path` or `domain`.
