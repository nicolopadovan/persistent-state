---
title: Comparison
description: How persistent-state compares with use-local-storage-state, usehooks-ts, zustand persist, jotai atomWithStorage and Mantine hooks, with every fact dated 2026-10-15.
sidebar:
  order: 2
---

This page compares persistent-state with five libraries that keep React state in browser storage, and says when one of
them is the better choice. Every fact about another library was checked on **2026-10-15**, against the version in the
table below. Libraries change, so check a library's own documentation before you decide. "Not documented" means that no
option or section for the feature appears in the documentation and published package that were read, not that a
workaround is impossible. Anything that could not be confirmed is left out.

## Libraries compared

| Library                                                                                   | Version checked | Weekly downloads   | What it is                                                              |
| ----------------------------------------------------------------------------------------- | --------------- | ------------------ | ----------------------------------------------------------------------- |
| persistent-state                                                                          | 0.3.0           | not applicable     | Hooks and definitions over a cookie, `localStorage` or `sessionStorage` |
| [use-local-storage-state](https://www.npmjs.com/package/use-local-storage-state/v/20.0.0) | 20.0.0          | about 895 thousand | A hook for state in `localStorage`                                      |
| [usehooks-ts](https://www.npmjs.com/package/usehooks-ts/v/3.1.1)                          | 3.1.1           | about 6.2 million  | A collection of hooks, with storage hooks among them                    |
| [zustand](https://www.npmjs.com/package/zustand/v/5.0.15) `persist` middleware            | 5.0.15          | about 62.7 million | A store middleware that persists a store                                |
| [jotai](https://www.npmjs.com/package/jotai/v/3.0.1) `atomWithStorage`                    | 3.0.1           | about 6.7 million  | An atom that persists its value                                         |
| [Mantine hooks](https://www.npmjs.com/package/@mantine/hooks/v/9.7.2)                     | 9.7.2           | about 3.0 million  | The hooks package of the Mantine component library                      |

Weekly downloads are the npm registry's count for the week ending 2026-10-12 and say how widely a library is used, not
how well it fits. The zustand and jotai counts are for the whole library, not for persistence.

## Storage and server reads

| Library                 | Storages                                                                                   | Cookies                                                        | Server-side reads                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| persistent-state        | `cookie`, `localStorage` and `sessionStorage` under one API                                | Yes, with `path`, `domain`, `secure`, `sameSite` and `expires` | Cookies only: `readState()`, `readCookieState()` and `PersistentStateProvider` render the stored value on the server                                |
| use-local-storage-state | `localStorage`. The README points to a separate package for `sessionStorage`               | No                                                             | A `defaultServerValue` option sets the value used for the server render                                                                             |
| usehooks-ts             | `useLocalStorage` and `useSessionStorage`, and `useReadLocalStorage` for reading           | No cookie hook is exported                                     | `initializeWithValue: false` renders the initial value first; the documentation recommends it for server rendering                                  |
| zustand `persist`       | `localStorage` by default, or any storage you pass to `createJSONStorage`, including async | Not built in                                                   | Hydration reads storage on the client. The documentation describes waiting until after hydration in Next.js, and `skipHydration` to rehydrate later |
| jotai `atomWithStorage` | `localStorage` by default, or `sessionStorage`, AsyncStorage or a custom storage           | Not built in                                                   | The server renders `initialValue`; `getOnInit` defaults to `false`, and the documentation suggests rendering stored values on the client only       |
| Mantine hooks           | `useLocalStorage` and `useSessionStorage`                                                  | No cookie hook is exported                                     | `getInitialValueInEffect` defaults to `true`, so storage is read after mount                                                                        |

## Sync across tabs

| Library                 | Cross-tab sync                                                                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| persistent-state        | On by default (`sync`). `localStorage` follows `storage` events and cookies follow a `BroadcastChannel` message. `sessionStorage` is per tab, never synced |
| use-local-storage-state | On by default (`storageSync`): `storage` events across tabs, windows and iframes, and hooks in the same tab                                                |
| usehooks-ts             | `useLocalStorage` listens to the `storage` event and to a custom event for hooks in the same tab                                                           |
| zustand `persist`       | Not built in. The FAQ shows listening for the `storage` event and calling `rehydrate()` yourself                                                           |
| jotai `atomWithStorage` | The default storage subscribes to `storage` events                                                                                                         |
| Mantine hooks           | `sync` defaults to `true`; the documentation says the hook subscribes to the `storage` event and updates every open tab                                    |

## Validation, migrations and expiry

| Library                 | Validation                                                                            | Migrations                                  | Expiry                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------- |
| persistent-state        | Any Standard Schema (zod, valibot, arktype); an invalid stored value yields `default` | `version` and `migrate`                     | `expires`: a cookie's expiry in days, or a stored deadline for Web Storage |
| use-local-storage-state | Not documented                                                                        | Not documented                              | Not documented                                                             |
| usehooks-ts             | No option                                                                             | No option                                   | No option                                                                  |
| zustand `persist`       | No option; `merge` controls how stored state combines with current state              | `version` and `migrate`, which may be async | No option                                                                  |
| jotai `atomWithStorage` | Through a custom storage, or the exported `unstable_withStorageValidator`             | Not documented                              | Not documented                                                             |
| Mantine hooks           | No option                                                                             | No option                                   | No option                                                                  |

## Consent, write timing and dependencies

persistent-state accepts a `consent` predicate. While it returns `false`, storage is neither read nor written. It also
accepts `debounceMs`, which delays storage writes and flushes pending ones on `pagehide` and when the page becomes
hidden.

| Library                 | Dependencies and requirements                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| persistent-state        | No runtime dependencies. Peers: `react` 18.3 or 19, and `next` 15 or 16 for `/next` only |
| use-local-storage-state | No dependencies. Peers: `react` and `react-dom` 18 or later                              |
| usehooks-ts             | Depends on `lodash.debounce`                                                             |
| zustand `persist`       | Part of zustand, so it needs a zustand store                                             |
| jotai `atomWithStorage` | Part of jotai, so it needs a jotai store                                                 |
| Mantine hooks           | Peer `react` 19.2 or later                                                               |

## What no checked library combines

Across the documentation and options checked on 2026-10-15, none of the five libraries documents a single React API
over cookies and Web Storage with server-side reads, and none documents consent gating or debounced storage writes
flushed on page hide. persistent-state is built around that combination. This is an absence in the documentation that
was read, so treat it as a statement about 2026-10-15 and not as a guarantee.

## When to choose another library

persistent-state is not the smallest or the most widely used option. Choose another library when:

- **You need only `localStorage`, in components that render on the client.** use-local-storage-state does that with no
  dependencies and a small surface. It covers cross-tab sync, an in-memory fallback with `isPersistent`, and
  `defaultServerValue`. persistent-state returns the same `[value, setValue, meta]` shape, so moving between them
  means translating options, and `removeItem` becomes `reset`.
- **You already manage state with zustand or jotai.** Their persistence belongs to the store, with `partialize`, `merge`
  and the store's own subscriptions. persistent-state does not replace a state manager. The roadmap lists
  [interop with both](/help/roadmap/) for 1.1.0, which is not released.
- **You already use Mantine or usehooks-ts and need no cookies, server reads or validation.** The storage hooks ship with
  the library, and adding another dependency buys nothing.
- **You need asynchronous storage today.** zustand `persist` and jotai `atomWithStorage` document async storages such as
  React Native's AsyncStorage. persistent-state's storage is synchronous until 0.8.0.
- **You do not use React.** persistent-state's core has no React dependency, but the bindings for Vue, Svelte and Solid
  arrive in 0.5.0 to 0.7.0. See the [roadmap](/help/roadmap/).
- **You run React older than 18.3 or Node.js older than 22.** persistent-state does not support them.

Choose persistent-state when state that the first paint depends on, such as a theme, should render correctly on the
server from a cookie; when stored values need a schema, a version and a migration; when storage must wait for consent;
or when one API should cover cookies, `localStorage` and `sessionStorage`.

<details>
<summary>How the facts were gathered</summary>

On 2026-10-15, the version of each library named above was read from the npm registry: the package metadata for
dependencies and peer dependencies, the published files for option names and defaults, and the library's README or
documentation page for behavior. Download counts come from the npm downloads API for the week ending 2026-10-12. The
documented behaviors listed here are not the result of running the libraries.

</details>
