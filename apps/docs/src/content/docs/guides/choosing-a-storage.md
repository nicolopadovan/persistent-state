---
title: Choosing a storage
description: Compare cookie, localStorage and sessionStorage by lifetime, size, server access, tab scope, sync and privacy, and see what each renders during hydration.
sidebar:
  order: 1
---

This page compares the three storages a persistent-state definition can use, explains what each one renders on the
server and during hydration, and covers the cookie attributes and the limits to plan for.

Choose the storage with the `storage` option of `persistentState()`:

```ts
import { persistentState } from '@nicolopadovan/persistent-state'

export const theme = persistentState('theme', { default: 'system', storage: 'cookie' })
export const draft = persistentState('draft', { default: '', storage: 'sessionStorage' })
export const filters = persistentState('filters', { default: { status: 'open' } })
```

Without `storage`, a definition uses `localStorage`.

## Comparison

| Property                        | `cookie`                                                                                  | `localStorage`                                       | `sessionStorage`                                         |
| ------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------- |
| Lifetime                        | 365 days from each write. Change it with `expires`; `expires: 0` writes a session cookie. | Until it is removed. `expires` removes it once past. | Until the tab is closed. `expires` removes it once past. |
| Size                            | Usually about 4 KB per cookie, and browsers limit the number of cookies per domain.       | About 5 MiB per origin, depending on the browser.    | About 5 MiB per origin, depending on the browser.        |
| Readable on the server          | Yes: `readState`, `PersistentStateProvider` and `readCookieState`.                        | No. The server never reads it.                       | No. The server never reads it.                           |
| Sent to the server              | With every request to a matching domain and path, including images and scripts.           | Never, unless your code sends it.                    | Never, unless your code sends it.                        |
| Shared between tabs             | Yes, and with subdomains when you set `domain`.                                           | Yes, within one origin.                              | No. Each tab has its own copy.                           |
| Synced between open tabs        | Yes by default, through a `BroadcastChannel`, and when a hidden tab becomes visible.      | Yes by default, through `storage` events.            | Never.                                                   |
| First render on the server      | The stored value when the cookie is listed in a provider; otherwise the default.          | The default.                                         | The default.                                             |
| Readable by scripts on the page | Yes. A cookie written by script cannot be `HttpOnly`.                                     | Yes.                                                 | Yes.                                                     |

Set `sync: false` on a definition to stop it following other tabs. `sessionStorage` is never synced, whatever `sync`
says. See [Synchronization](#synchronization).

## Which storage should I use?

- **Use a cookie** for small state that the first paint depends on or that the server needs: a theme, a layout, whether a
  sidebar is open, a locale or a currency. It is the only storage that can render without a flash, and it is sent with
  every request, so keep the value small.
- **Use `localStorage`** for client-only state that is larger or that the server does not need: filters, drafts, dismissed
  notices. It costs nothing per request. The value appears in one render after the first one, as the next section
  describes.
- **Use `sessionStorage`** for state that belongs to one tab and should not leak into others: the step of a wizard in
  progress or an unsaved draft.

Changing the `storage` of a key does not move what is already stored. A definition reads only its own storage, so
visitors start from the default; read the old value with a definition of the old storage and `set()` it on the new one
if you need to keep it.

## Server rendering and hydration

React compares the HTML the server rendered with the first render on the client. The snapshot that `useStoredState()`
gives React must therefore be equal on the server and during hydration, so a definition renders as follows:

| Storage                          | Server render                                     | Hydration                                  | After hydration                                       |
| -------------------------------- | ------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------- |
| `cookie`, listed in a provider   | The value decoded from the provider's raw cookie. | The same raw cookie, decoded the same way. | `document.cookie`, normally the same value: no flash. |
| `cookie`, no provider value      | The default.                                      | The default.                               | The stored value, after one render with the default.  |
| `localStorage`, `sessionStorage` | The default.                                      | The default.                               | The stored value, after one render with the default.  |

The server never reads Web Storage, and the client never reads storage while hydrating. Use `storage: 'cookie'` for state
that the first paint depends on, such as a theme or the open state of a sidebar, and list it in
`PersistentStateProvider`. The [Next.js guide](/guides/nextjs/) shows how. In other React server-rendering frameworks,
render `CookieValuesProvider` with the request's cookies.

## Cookies

A cookie definition writes its cookie with `document.cookie`. These options control its attributes, and each one is
applied on every write:

| Option     | Default                  | Meaning                                                                                           |
| ---------- | ------------------------ | ------------------------------------------------------------------------------------------------- |
| `expires`  | `365`                    | Days from each write, or a `Date`. `0` writes a session cookie.                                   |
| `path`     | `'/'`                    | The cookie's `Path`. The browser sends the cookie only for requests under it.                     |
| `domain`   | None                     | The cookie's `Domain`. Without it, the cookie belongs to the current host and not its subdomains. |
| `secure`   | `true` on `https:` pages | Whether the cookie carries `Secure`.                                                              |
| `sameSite` | `'lax'`                  | The cookie's `SameSite` attribute: `'strict'`, `'lax'` or `'none'`.                               |

```ts
import { persistentState } from '@nicolopadovan/persistent-state'

export const locale = persistentState('locale', {
  default: 'en',
  storage: 'cookie',
  expires: 180,
  domain: 'example.com',
  sameSite: 'lax',
})
```

The cookie attributes are a type error for a definition whose `storage` is not `'cookie'`. Keep the default `path` for
state that the server reads: with another path, only requests under that path carry the cookie, and the server sees the
default everywhere else.

A cookie is sent with every matching request, so a large value makes every request larger, and servers and proxies limit
the total size of the request headers. After each write, persistent-state reads `document.cookie` back. A cookie that
the browser refused or that exceeded its limit does not read back: the write is reported to `onError` as `write-failed`,
`isPersistent` becomes `false`, and the value stays in memory. A later successful write sets `isPersistent` back to
`true`.

<details>
<summary>Cookies written by older versions, duplicates and <code>reset()</code></summary>

Reads accept a cookie under any name an older version may have written it with: the canonical name, the raw key, and its
single and double URI-encoded forms. The first name that is present wins. `reset()` expires the cookie under every one
of those names, with the definition's `path` and `domain`.

`reset()` therefore cannot reach a cookie of the same name that was set on a different path or on a different domain.
That cookie stays, and a later read can find it and bring an old value back.

Two cookies of one name can also coexist when they were set with different paths or domains. The browser lists both in
`document.cookie`, and persistent-state uses the first one on the client. A Next.js server uses the last one, because
its request cookies keep the last value of a repeated name. The server render and the client can then show different
values. Remove the stray cookie, for example by expiring it with its original `path` and `domain`.

</details>

## Web Storage

`localStorage` and `sessionStorage` hold about 5 MiB per origin, depending on the browser, and never leave the browser on
their own.

- When a write throws because the storage is full, the error is reported to `onError` as `write-failed`, `isPersistent`
  becomes `false` and the value stays in memory. A full storage still lets stored values be read and removed.
- When the storage is unavailable, for example because the browser blocks it, persistent-state reports `unavailable`
  once, keeps the value in memory for the page, and sets `isPersistent` to `false`. A storage failure is reported to
  `onError` and never thrown.
- An `expires` that has passed is checked when the item is read, not by a timer. See
  [Expiry](/guides/schemas-and-migrations/#expiry).
- Browsers may remove storage on their own. Safari, for example, deletes data created by script for an origin that the
  visitor has not interacted with for seven days of browser use, when cross-site tracking prevention is on; cookies set
  by the server are exempt. See the MDN page on
  [storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).
  Treat stored state as a preference you can recreate, not as the only copy of data.

## Synchronization

With `sync` on, which is the default, definitions follow changes made in other tabs:

- **`localStorage`**: `storage` events for the stored name run the read again, including the one a tab sends when it
  calls `clear()`.
- **`cookie`**: after a successful cookie write or removal, the writing tab posts a message on a `BroadcastChannel`
  named `persistent-state`. The message carries only the definition's identity, and the receiving tab reads
  `document.cookie` itself. Cookie definitions also read again when a hidden tab becomes visible, which picks up cookies
  that the server set in the meantime.
- **`sessionStorage`**: never synced.
- A value that lives only in memory, because storage is unavailable or `consent` is not given, is never synced.

Inside one tab, every hook and definition with the same storage and full key shares one record and updates together,
regardless of `sync`.

## Privacy

Stored values are not encrypted or signed. The visitor can read and change them, and so can any script that runs on the
page, in all three storages. Never store a secret or a session credential in persistent-state, and validate what you
read with a [schema](/guides/schemas-and-migrations/) before you trust it.

Whether a stored value needs the visitor's consent depends on its purpose and on the law that applies to you.
persistent-state does not decide that, and nothing in these docs states that a setup complies with a law. The `consent`
option stores a value only while you allow it: see [Consent](/guides/consent/).
