---
title: Roadmap
description: What persistent-state plans to add before and after 1.0.0, in the order it ships, and the known gaps in the current release.
sidebar:
  order: 3
---

This page describes where persistent-state is heading and where the current release stops. It lists the planned
versions in the order they ship, and the known gaps in 0.3.0, each with a workaround where one exists. Planned work has
no dates; each version's [milestone on GitHub](https://github.com/nicolopadovan/persistent-state/milestones) lists its
issues, and the [changelog](/help/changelog/) records what each release actually ships.

## Planned

1.0.0 follows the roadmap core, which is 0.4.0 to 0.10.0. Each row is its own version and its own GitHub milestone. The
version links to the issues of that milestone.

| Version                                                                                       | Item                                                                                                                                         | Priority |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| [0.4.0](https://github.com/nicolopadovan/persistent-state/issues?q=milestone%3A%220.4.0%22)   | Server writes: `writeState` and `resetState` in `/next` for Server Actions and Route Handlers; core `serializeStateCookie` for other servers | High     |
| [0.5.0](https://github.com/nicolopadovan/persistent-state/issues?q=milestone%3A%220.5.0%22)   | Vue binding (`/vue` composable) and Nuxt server reads                                                                                        | High     |
| [0.6.0](https://github.com/nicolopadovan/persistent-state/issues?q=milestone%3A%220.6.0%22)   | Svelte binding (`/svelte`) and SvelteKit server reads                                                                                        | Medium   |
| [0.7.0](https://github.com/nicolopadovan/persistent-state/issues?q=milestone%3A%220.7.0%22)   | Solid binding (`/solid`) and SolidStart server reads                                                                                         | Medium   |
| [0.8.0](https://github.com/nicolopadovan/persistent-state/issues?q=milestone%3A%220.8.0%22)   | Async storage: a storage driver interface, an IndexedDB driver, and the loading state hooks need for it (also covers React Native storage)   | High     |
| [0.9.0](https://github.com/nicolopadovan/persistent-state/issues?q=milestone%3A%220.9.0%22)   | URL-state interop: seed a definition from a search parameter and mirror it back, for shareable links                                         | Medium   |
| [0.10.0](https://github.com/nicolopadovan/persistent-state/issues?q=milestone%3A%220.10.0%22) | Devtools: an `inspect()` API listing every definition, its value, storage and persistence, and a small in-page panel                         | Low      |
| [1.0.0](https://github.com/nicolopadovan/persistent-state/issues?q=milestone%3A%221.0.0%22)   | API freeze: deprecated aliases removed, semver guarantees from here on                                                                       | High     |
| [1.1.0](https://github.com/nicolopadovan/persistent-state/issues?q=milestone%3A%221.1.0%22)   | Interop: a zustand `persist` storage and a jotai `atomWithStorage` storage backed by definitions                                             | Low      |
| [1.2.0](https://github.com/nicolopadovan/persistent-state/issues?q=milestone%3A%221.2.0%22)   | Server-synced storage: a driver that syncs through an endpoint you provide, across devices, with an offline queue                            | Medium   |
| [1.3.0](https://github.com/nicolopadovan/persistent-state/issues?q=milestone%3A%221.3.0%22)   | A hosted sync backend (under consideration; depends on 1.2.0 being used)                                                                     | Low      |

## Known gaps in 0.3.0

Each row describes behavior of the current release that you might not expect, with what you can do about it today.

| Gap                                                                                                                                                                                        | Workaround                                                                                                                                                                                                                    | Planned                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `set()` and `reset()` throw on the server, so a Server Action or Route Handler cannot change cookie state.                                                                                 | Change the value in the browser, for example in an event handler. Read cookie state on the server with `readState()` or `readCookieState()`.                                                                                  | [0.4.0](https://github.com/nicolopadovan/persistent-state/issues?q=milestone%3A%220.4.0%22) |
| The hooks exist for React only: `/react` and `/next`.                                                                                                                                      | The core imports nothing from React. A definition from `persistentState()` has `get()`, `set()`, `reset()` and `subscribe()`, which any framework can bind to, and `readCookieState()` reads cookies from any server runtime. | 0.5.0 to 0.7.0                                                                              |
| Storage is synchronous: a cookie, `localStorage` or `sessionStorage`. A `schema` must validate synchronously; a schema that returns a promise reports `async-schema` and yields `default`. | Use the storage of another library for asynchronous storage, such as React Native's. The [comparison](/help/comparison/) lists what each one offers.                                                                          | [0.8.0](https://github.com/nicolopadovan/persistent-state/issues?q=milestone%3A%220.8.0%22) |
| A state whose `default` is a string reads a stored `null` as the text `"null"`.                                                                                                            | Clear the value with `reset()` instead of `set(null)`, or give the state a `default` that is not a string. See [stored `null` and nullable strings](/help/migrating/#null-and-nullable-strings).                              | none                                                                                        |
| Cookie keys that differ only in how a character is encoded can read and remove each other's cookie.                                                                                        | Avoid `%` and characters that `encodeURIComponent` escapes in cookie keys. See [name variants that alias](/help/migrating/#cookie-name-variants-that-alias).                                                                  | none                                                                                        |
