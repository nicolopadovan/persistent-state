# @nicolopadovan/persistent-state

Persistent React state in a cookie, `localStorage` or `sessionStorage`, readable on the server for cookies. Declare a
key once with its type, storage and options, then use it in components with `useStoredState` and on the server with
`readState`.

- **One declaration per key:** `persistentState()` defines the key, its storage and its options in one module that
  server and client code both import.
- **No flash on the server:** cookie state renders its stored value on the server and hydrates without a mismatch.
  `localStorage` and `sessionStorage` render their default first, then the stored value.
- **Reliable:** an in-memory fallback with an `isPersistent` flag when storage is blocked or full, validation with any
  Standard Schema library (zod, valibot, arktype), `version` and `migrate`, expiry for Web Storage, and debounced writes
  flushed when the page is hidden.
- **Synced:** components in one tab share a key. Other tabs follow `localStorage` through `storage` events and cookies
  through `BroadcastChannel`; `sessionStorage` is per tab.
- **Consent-aware:** an optional `consent` predicate keeps a key out of storage until it returns `true`.
- **Light:** no runtime dependencies. React and Next.js are optional peer dependencies. ESM only.

## Install

```bash
npm install @nicolopadovan/persistent-state
```

It needs React 18.3 or 19, and Next.js 15 or 16 for the `/next` entry point.

> Every 0.x minor may contain breaking changes. Pin the version you depend on and read the changelog before you
> upgrade.

## Quick start

```ts
// lib/state.ts: no 'use client', so server and client code can both import it
import { persistentState } from '@nicolopadovan/persistent-state'

export type Theme = 'light' | 'dark' | 'system'

export const theme = persistentState<Theme, 'cookie'>('theme', { default: 'system', storage: 'cookie' })
```

Use it in a component:

```tsx
'use client'
import { useStoredState } from '@nicolopadovan/persistent-state/react'
import { theme } from '../lib/state'

export function ThemeToggle() {
  const [value, setValue] = useStoredState(theme)
  return <button onClick={() => setValue(value === 'dark' ? 'light' : 'dark')}>{value}</button>
}
```

In the Next.js App Router, list the cookie definitions the first paint depends on in `PersistentStateProvider`, in the
layout that needs them. Without it, a cookie definition renders its default on the server and the stored value after
hydration.

```tsx
// app/layout.tsx
import { PersistentStateProvider } from '@nicolopadovan/persistent-state/next'
import { theme } from '../lib/state'

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

In a Server Component, Server Action or Route Handler, `await readState(theme)` returns the stored value.

## Documentation

**[persistent-state.nicolopadovan.com](https://persistent-state.nicolopadovan.com)**: guides, the API reference and
how it works. The documentation as one Markdown file for AI agents is at
[llms-full.txt](https://persistent-state.nicolopadovan.com/llms-full.txt), and the package ships an `AGENTS.md` with
usage rules for them.

AI tools were used to write this repository's code, tests and documentation. Every change goes through the same tests
and CI checks before it is released.

## License

[MIT](./LICENSE)
