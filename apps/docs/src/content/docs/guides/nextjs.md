---
title: Next.js App Router
description: Render stored cookie state on the server with PersistentStateProvider and readState, without a flash of the default value.
sidebar:
  order: 2
---

This page covers using persistent-state in the Next.js App Router: how a cookie definition renders its stored value in
the first HTML, how to read it in Server Components, Server Actions and Route Handlers, what it means for dynamic
rendering, and what is not possible yet.

The `@nicolopadovan/persistent-state/next` entry point needs Next.js 15 or 16 and imports `next/headers`. Import it only
from Server Components, Server Actions and Route Handlers. A server can read only cookies, so only definitions with
`storage: 'cookie'` render their stored value on the server. See [Choosing a storage](/guides/choosing-a-storage/).

## Set up

### 1. Declare the state in a shared module

Declare each key once and import it from both server and client code, so do not add `'use client'` to this module. The
schema makes the server and the client accept only the values you expect.

```ts title="lib/state.ts"
import { persistentState } from '@nicolopadovan/persistent-state'
import { z } from 'zod'

export const theme = persistentState('theme', {
  default: 'system',
  storage: 'cookie',
  schema: z.enum(['light', 'dark', 'system']),
})

export const currency = persistentState('currency', {
  default: 'EUR',
  storage: 'cookie',
  schema: z.enum(['EUR', 'USD', 'GBP']),
})
```

Without a schema, give the type explicitly. TypeScript does not infer the remaining type arguments once you pass some,
so pass the storage too: `persistentState<Theme, 'cookie'>('theme', { default: 'system', storage: 'cookie' })`.

### 2. List the definition in the provider

`PersistentStateProvider` is an async Server Component. Render it in the layout that wraps every component that renders
the state, and list the definitions in `states`.

```tsx title="app/layout.tsx"
import type { ReactNode } from 'react'
import { PersistentStateProvider } from '@nicolopadovan/persistent-state/next'
import { theme } from '@/lib/state'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PersistentStateProvider states={[theme]}>{children}</PersistentStateProvider>
      </body>
    </html>
  )
}
```

The provider reads the cookies of the listed definitions, under every name an older version may have written them, and
passes their raw values to `CookieValuesProvider` from `@nicolopadovan/persistent-state/react`. No other cookie reaches
the client.

### 3. Use the state in Client Components

```tsx title="components/theme-toggle.tsx"
'use client'

import { useStoredState } from '@nicolopadovan/persistent-state/react'
import { theme } from '@/lib/state'

export function ThemeToggle() {
  const [value, setValue] = useStoredState(theme)
  return (
    <button onClick={() => setValue(value === 'dark' ? 'light' : 'dark')}>
      Theme: {value}
    </button>
  )
}
```

`useStoredState()` needs no provider for `localStorage` or `sessionStorage` definitions, and no provider for cookie
definitions on the client. The provider matters only for the server render and for hydration.

## Why there is no flash

During server rendering, `useStoredState()` gives React the value decoded from the provider's raw cookie. During
hydration on the client it gives React the same raw cookie, decoded the same way, so the first client render equals the
server's HTML. After hydration the value comes from `document.cookie`, which is normally the same value.

| Definition                                    | Server render     | After hydration                                      |
| --------------------------------------------- | ----------------- | ---------------------------------------------------- |
| `cookie`, listed in `PersistentStateProvider` | The stored value. | The same value: no flash.                            |
| `cookie`, not listed                          | The default.      | The stored value, after one render with the default. |
| `localStorage` or `sessionStorage`            | The default.      | The stored value, after one render with the default. |

List every cookie definition that the first paint depends on. In development, a cookie definition that is rendered on the
server under a provider that does not list it logs one warning naming its key.

## Read cookie state on the server

`readState()` reads a cookie definition in a Server Component, a Server Action or a Route Handler. It returns the
decoded value, migrated and validated as on the client, or the default when the visitor has no cookie for it.

```tsx title="app/products/page.tsx"
import { readState } from '@nicolopadovan/persistent-state/next'
import { currency } from '@/lib/state'
import { listProducts } from '@/lib/products'

export default async function ProductsPage() {
  const selected = await readState(currency)
  const products = await listProducts(selected)
  return (
    <ul>
      {products.map((product) => (
        <li key={product.id}>
          {product.name}: {product.price}
        </li>
      ))}
    </ul>
  )
}
```

Passing a definition whose `storage` is not `'cookie'` is a type error. `readState()` neither writes the cookie back nor
evaluates the definition's `consent` predicate. A migrated value is written back the next time the browser reads the
cookie. See [Consent](/guides/consent/#the-server-does-not-evaluate-the-predicate).

For a server that is not Next.js, `readCookieState(definition, cookies)` from the root entry point does the same with any
object that has a `get(name)` method returning `{ value }`, or with a `Cookie` header string.

## Dynamic rendering

Reading cookies makes a route dynamic. `PersistentStateProvider` and `readState()` both call `cookies()` from
`next/headers`, so every route that renders them is rendered for each request instead of being prerendered at build time.

- Render `PersistentStateProvider` in the layout that needs it, such as the layout of a route group, rather than the root
  layout, so that marketing pages and other routes that do not render the state can stay static.
- State in `localStorage` and `sessionStorage` does not read cookies and costs nothing in rendering mode. Prefer it for
  state the first paint does not depend on.
- With Cache Components, the Next.js documentation says that calling `cookies()` outside a `<Suspense>` boundary prevents
  the route from being prerendered. See the Next.js documentation for
  [`cookies()`](https://nextjs.org/docs/app/api-reference/functions/cookies).

<details>
<summary>What the 0.2.1 <code>CookiesProvider</code> cost</summary>

Version 0.2.1 depended on `next-client-cookies` and required its provider, re-exported as
`PersistentStateCookiesProvider`, around every use, including uses of `localStorage` and `sessionStorage`. The provider
belonged in the root layout, where reading cookies made every route dynamic whether or not it used persisted state.

Starting with 0.3.0, the dependency and the provider are gone. A provider is needed only to render cookie definitions on
the server, and you place it where it is needed. See [Migrating](/help/migrating/) to move from 0.2.1.

</details>

## Other servers and frameworks

In another React server-rendering framework, render `CookieValuesProvider` from
`@nicolopadovan/persistent-state/react` with the request's cookies, as a `Cookie` header string or as a record of cookie
names to values. Render it with the same cookies on the server and on the client.

```tsx
import type { ReactNode } from 'react'
import { CookieValuesProvider } from '@nicolopadovan/persistent-state/react'

export function Document({ request, children }: { request: Request; children: ReactNode }) {
  return <CookieValuesProvider cookies={request.headers.get('cookie') ?? ''}>{children}</CookieValuesProvider>
}
```

## Writing state from the server

Server-side writes are not supported in 0.3.0. On the server, `set()` and `reset()` throw an error that names
`readState()`, and a Server Action cannot set a persistent-state cookie. `writeState` and `resetState` for Server
Actions and Route Handlers are planned for 0.4.0; see the [roadmap](/help/roadmap/).

Until then, change the value in a Client Component with `set()`, and pass whatever a Server Action needs as an argument
instead of relying on the cookie having been written by then. `get()` returns the default on the server, and
`subscribe()` does nothing there.

## Troubleshooting

- **The value flashes from the default to the stored value.** The definition is not listed in `states`, it is stored in
  `localStorage` or `sessionStorage`, or its cookie is not sent for this route because of its `path`. Keep the default
  `path` of `'/'` for state that the server reads.
- **A warning names a key in development.** A cookie definition rendered on the server is missing from the `states` of the
  provider above it.
- **The server and the browser disagree.** Two cookies of the same name exist, set with different paths or domains. The
  server uses the last one and the browser uses the first. See
  [Choosing a storage](/guides/choosing-a-storage/#cookies).
