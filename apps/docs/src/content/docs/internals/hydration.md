---
title: Hydration snapshots
description: What a component renders on the server and during hydration, why it never mismatches, and how cookie values reach the first render.
sidebar:
  order: 5
---

This page explains what `useStoredState()` and `usePersistentState()` render on the server and while a page hydrates,
how the value of a cookie reaches that first render, and why the stored value follows right after. It is for readers who
need the exact behavior, for example to understand why a Web Storage value appears one render late, or why the
development server logs a warning about a cookie definition.

The hooks and `CookieValuesProvider` are in `src/react/index.ts`; `PersistentStateProvider` and `readState()` are in
`src/next.tsx`.

## The two snapshots

Both hooks read a definition through React's `useSyncExternalStore`, which takes two functions that return the current
value:

- `getSnapshot` runs in the browser after hydration, and for the whole life of a client-only app. It returns
  `definition.get()`, the value of the [shared record](/internals/shared-record/).
- `getServerSnapshot` runs while rendering on the server and while hydrating on the client. React requires that it
  returns the same value on the server and on the client, so the first client render matches the server's HTML.

A client-only app, which never hydrates, never calls `getServerSnapshot`: its first render reads storage directly.

## What the server snapshot returns

| Definition                         | Server render and hydration                                       | After hydration                                     |
| ---------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------- |
| `localStorage` or `sessionStorage` | The `default`.                                                    | The stored value, in one more render if it differs. |
| `cookie`, below a provider         | The provider's cookie value, or the `default` when it holds none. | The same value.                                     |
| `cookie`, with no provider         | The `default`.                                                    | The stored value, in one more render if it differs. |

The server never reads Web Storage, because it does not exist there, and the client never reads it while hydrating, so
the two renders cannot differ. A Web Storage value therefore appears in the render after hydration, the one React
schedules when `getSnapshot` returns something other than the server snapshot. A definition used for something that must
not flash, such as a theme, belongs in a cookie, with a provider.

The `isPersistent` flag returned by the hooks has its own server snapshot, which is always `true`. A component that shows
a notice when a value is not persistent therefore never renders it on the server, and the notice appears after hydration
only if the value really is not stored.

## How a cookie reaches the first render

`CookieValuesProvider` takes the request's cookies, either as a record of cookie names to values or as a raw `Cookie`
header, and parses them once into a jar. For a cookie definition, the server snapshot is then
[`readCookieState()`](/internals/read-pipeline/#server-reads) over that jar: the same decoding, migration and
validation as in the browser, and the default when the cookie is missing or unreadable. Failures go to the definition's
`onError`.

The snapshot is computed once per definition and provider, and cached in a `WeakMap` owned by the provider. React calls
`getServerSnapshot` repeatedly and compares the results with `Object.is`, so a schema that returns a new object each
time would otherwise make every render look like a change.

Render the provider with the same `cookies` on the server and on the client. In Next.js, `PersistentStateProvider` does
this: it runs on the server, reads `cookies()`, and passes the values to the client as the props of
`CookieValuesProvider`, so the browser hydrates from the same jar the server rendered from.

<details>
<summary>Which cookies reach the client</summary>

`PersistentStateProvider` does not pass the whole cookie jar to the client. For each definition in `states`, it reads the
cookie under every name an older version may have written (the names listed in
[the read pipeline](/internals/read-pipeline/#cookie-names)), and passes only those. Other cookies, such as a session
cookie, never leave the server, because the props of a client component are part of the page the browser receives.

Because it calls `cookies()`, like every use of `cookies()` in Next.js it makes the route dynamic. Render it in the
layout that needs it, not around the whole application, when other routes can be static.

</details>

## The development warning

A cookie definition rendered on the server below a provider that holds nothing for it renders its default, which is
usually a mistake: the visitor has a stored value, and the page shows something else until hydration. In development,
the server logs a warning once per key. The warning is logged when:

- the provider was given `listed` (as `PersistentStateProvider` does) and the definition's key is not in it, or
- the provider has no `listed` and its jar holds no cookie under any name of the key.

A definition that is listed but whose cookie the visitor does not have yet stays quiet, because its default is the correct
render. The warning is never logged in production, in the browser, or when there is no provider at all: without a
provider, rendering the default is the documented behavior.

## After hydration

Once React has hydrated, `getSnapshot` takes over. `definition.get()` loads the shared record, which reads storage
through the [read pipeline](/internals/read-pipeline/), evaluating `consent` on the way. When the result differs from
the server snapshot, React renders again with it. For a cookie definition this happens only when the cookie changed
between the request and hydration, or when `consent` returns `false`, because `readCookieState()` does not evaluate it.
